from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import asyncio
from typing import List, Optional
from datetime import datetime
import threading
import time
import re

from models import *
from database import db, get_db_connection
from config import settings
import sql_queries

# --- Remote CPU Monitor: real-time via xp_cmdshell + wmic ---
class RemoteCPUMonitor:
    """Monitors CPU on remote SQL Servers using xp_cmdshell wmic command.
    This reads the same Win32_Processor LoadPercentage that Task Manager uses.
    Background thread refreshes every 2 seconds."""
    
    def __init__(self):
        self._cpu_data = {}  # server_ip -> {total_cpu, sql_cpu, timestamp}
        self._lock = threading.Lock()
        self._running = False
        self._thread = None
    
    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
        print("Remote CPU Monitor started (xp_cmdshell + wmic, real-time)")
    
    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
    
    def _monitor_loop(self):
        """Poll all configured servers every 2 seconds."""
        while self._running:
            for server_ip in settings.sql_servers.keys():
                try:
                    total_cpu, sql_cpu = self._query_cpu(server_ip)
                    with self._lock:
                        self._cpu_data[server_ip] = {
                            "total_cpu": total_cpu,
                            "sql_cpu": sql_cpu,
                            "timestamp": time.time()
                        }
                except Exception as e:
                    print(f"CPU query failed for {server_ip}: {e}")
            time.sleep(2)
    
    def _query_cpu(self, server_ip: str) -> tuple:
        """Query real-time CPU via xp_cmdshell on the remote server.
        Uses Win32_PerfFormattedData_PerfOS_Processor (_Total) - same as Task Manager.
        """
        db_conn = get_db_connection(server_ip)
        
        # Get total system CPU via PercentProcessorTime (_Total) - exact Task Manager source
        results = db_conn.execute_query(
            "EXEC xp_cmdshell 'wmic path Win32_PerfFormattedData_PerfOS_Processor where Name=\"_Total\" get PercentProcessorTime /value'"
        )
        
        total_cpu = 0
        if results:
            for row in results:
                output = row.get('output', '') or ''
                match = re.search(r'PercentProcessorTime=(\d+)', output)
                if match:
                    total_cpu = int(match.group(1))
                    break
        
        # Get SQL Server specific CPU from ring buffer (latest sample)
        sql_cpu = 0
        try:
            sql_results = db_conn.execute_query("""
                SELECT TOP 1
                    record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'int') AS sql_cpu
                FROM (
                    SELECT CONVERT(xml, record) AS record, [timestamp]
                    FROM sys.dm_os_ring_buffers WITH (NOLOCK)
                    WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR' 
                    AND record LIKE N'%<SystemHealth>%'
                ) AS x
                ORDER BY [timestamp] DESC
            """)
            if sql_results and sql_results[0].get('sql_cpu') is not None:
                sql_cpu = sql_results[0]['sql_cpu']
        except:
            pass
        
        return total_cpu, sql_cpu
    
    def get_cpu(self, server_ip: str) -> dict:
        """Get cached CPU for a server."""
        with self._lock:
            data = self._cpu_data.get(server_ip, {})
            return {
                "total_cpu": data.get("total_cpu", 0),
                "sql_cpu": data.get("sql_cpu", 0)
            }

# Global instance
cpu_monitor = RemoteCPUMonitor()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start remote CPU monitor (WMI-based, real-time)
    cpu_monitor.start()
    yield
    cpu_monitor.stop()

app = FastAPI(
    title="SQL Server Audit & Monitoring API",
    description="Real-time and historical SQL Server monitoring",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")

@app.get("/api/servers")
def get_servers():
    """Get list of available SQL Servers"""
    return {
        "servers": [
            {"ip": ip, "name": name} 
            for ip, name in settings.sql_servers.items()
        ],
        "default": settings.sql_server
    }

@app.get("/api/cpu-utilization")
def get_cpu_utilization(server: str = Query(settings.sql_server)):
    """Get real-time CPU utilization of the remote SQL Server machine.
    Uses xp_cmdshell + wmic (same source as Task Manager) with 2-second refresh.
    """
    try:
        data = cpu_monitor.get_cpu(server)
        return {
            "total_cpu": data["total_cpu"],
            "sql_cpu": data["sql_cpu"],
            "system_idle": 100 - data["total_cpu"]
        }
    except Exception as e:
        print(f"Error in get_cpu_utilization: {e}")
        return {"total_cpu": 0, "sql_cpu": 0, "system_idle": 100}

@app.get("/api/queries/running", response_model=List[RunningQuery])
def get_running_queries(
    server: str = Query(settings.sql_server),
    database: Optional[str] = None,
    login: Optional[str] = None,
    host: Optional[str] = None
):
    try:
        db_conn = get_db_connection(server)
        query = sql_queries.RUNNING_QUERIES
        conditions = []
        params = []
        
        if database:
            conditions.append("DB_NAME(r.database_id) = ?")
            params.append(database)
        if login:
            conditions.append("s.login_name = ?")
            params.append(login)
        if host:
            conditions.append("s.host_name = ?")
            params.append(host)
        
        if conditions:
            query += " AND " + " AND ".join(conditions)
        
        results = db_conn.execute_query(query, tuple(params) if params else None)
        return results
    except Exception as e:
        print(f"Error in get_running_queries: {e}")
        return []

@app.get("/api/queries/long-running", response_model=List[LongRunningQuery])
def get_long_running_queries(
    server: str = Query(settings.sql_server),
    limit: int = Query(10, ge=1, le=100),
    database: Optional[str] = None,
    login: Optional[str] = None
):
    try:
        db_conn = get_db_connection(server)
        query = sql_queries.LONG_RUNNING_QUERIES.replace("TOP 10", f"TOP {limit}")
        conditions = []
        params = []
        
        if database:
            conditions.append("DB_NAME(r.database_id) = ?")
            params.append(database)
        if login:
            conditions.append("s.login_name = ?")
            params.append(login)
        
        if conditions:
            query = query.replace("WHERE DATEDIFF", "WHERE " + " AND ".join(conditions) + " AND DATEDIFF")
        
        results = db_conn.execute_query(query, tuple(params) if params else None)
        return results
    except Exception as e:
        print(f"Error in get_long_running_queries: {e}")
        return []

@app.get("/api/queries/top-cpu", response_model=List[QueryStats])
def get_top_cpu_queries(
    server: str = Query(settings.sql_server),
    limit: int = Query(10, ge=1, le=100)
):
    try:
        db_conn = get_db_connection(server)
        query = sql_queries.TOP_CPU_QUERIES.replace("TOP 10", f"TOP {limit}")
        results = db_conn.execute_query(query)
        return results
    except Exception as e:
        print(f"Error in get_top_cpu_queries: {e}")
        return []

@app.get("/api/queries/top-io", response_model=List[QueryStats])
def get_top_io_queries(
    server: str = Query(settings.sql_server),
    limit: int = Query(10, ge=1, le=100)
):
    try:
        db_conn = get_db_connection(server)
        query = sql_queries.TOP_IO_QUERIES.replace("TOP 10", f"TOP {limit}")
        results = db_conn.execute_query(query)
        return results
    except Exception as e:
        print(f"Error in get_top_io_queries: {e}")
        return []

@app.get("/api/users/active", response_model=List[ActiveUser])
def get_active_users(server: str = Query(settings.sql_server)):
    try:
        db_conn = get_db_connection(server)
        results = db_conn.execute_query(sql_queries.ACTIVE_USERS)
        return results
    except Exception as e:
        print(f"Error in get_active_users: {e}")
        return []

@app.get("/api/users/list")
def get_user_list(server: str = Query(settings.sql_server)):
    try:
        db_conn = get_db_connection(server)
        query = "SELECT DISTINCT login_name FROM sys.dm_exec_sessions WHERE is_user_process = 1"
        results = db_conn.execute_query(query)
        return [r['login_name'] for r in results]
    except Exception as e:
        print(f"Error in get_user_list: {e}")
        return []

@app.get("/api/users/{login_name}/queries")
def get_user_queries(
    login_name: str,
    server: str = Query(settings.sql_server),
    limit: int = Query(100, ge=1, le=1000)
):
    try:
        db_conn = get_db_connection(server)
        # Query live DMVs for current/recent queries by this user
        query = f"""
        SELECT TOP {limit}
            r.session_id,
            DB_NAME(r.database_id) AS database_name,
            SUBSTRING(st.text, (r.statement_start_offset/2)+1,
                ((CASE r.statement_end_offset
                    WHEN -1 THEN DATALENGTH(st.text)
                    ELSE r.statement_end_offset
                END - r.statement_start_offset)/2) + 1) AS query_text,
            r.start_time,
            DATEDIFF(SECOND, r.start_time, GETDATE()) AS duration_seconds,
            r.cpu_time,
            r.logical_reads,
            r.writes
        FROM sys.dm_exec_requests r
        CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
        INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
        WHERE s.login_name = ?
        AND r.session_id != @@SPID
        ORDER BY r.start_time DESC
        """
        results = db_conn.execute_query(query, (login_name,))
        return results
    except Exception as e:
        print(f"Error in get_user_queries: {e}")
        return []

@app.get("/api/users/{login_name}/tables")
def get_user_table_access(
    login_name: str,
    server: str = Query(settings.sql_server)
):
    try:
        db_conn = get_db_connection(server)
        # Get tables accessed by querying index usage stats for databases
        # where this user has active sessions
        query = """
        SELECT TOP 20
            DB_NAME(ius.database_id) AS database_name,
            OBJECT_SCHEMA_NAME(ius.object_id, ius.database_id) AS schema_name,
            OBJECT_NAME(ius.object_id, ius.database_id) AS table_name,
            (ius.user_seeks + ius.user_scans + ius.user_lookups) AS total_reads,
            ius.user_updates AS total_writes
        FROM sys.dm_db_index_usage_stats ius
        WHERE ius.database_id IN (
            SELECT DISTINCT r.database_id 
            FROM sys.dm_exec_requests r
            INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
            WHERE s.login_name = ?
        )
        AND OBJECT_NAME(ius.object_id, ius.database_id) IS NOT NULL
        ORDER BY (ius.user_seeks + ius.user_scans + ius.user_lookups) DESC
        """
        results = db_conn.execute_query(query, (login_name,))
        return results
    except Exception as e:
        print(f"Error in get_user_table_access: {e}")
        return []

@app.get("/api/users/{login_name}/sessions")
def get_user_sessions(
    login_name: str,
    server: str = Query(settings.sql_server),
    limit: int = Query(100, ge=1, le=1000)
):
    try:
        db_conn = get_db_connection(server)
        # Query live sessions from DMV
        query = f"""
        SELECT TOP {limit}
            session_id,
            host_name,
            program_name,
            login_time,
            status,
            last_request_start_time,
            last_request_end_time
        FROM sys.dm_exec_sessions
        WHERE login_name = ?
        AND is_user_process = 1
        ORDER BY login_time DESC
        """
        results = db_conn.execute_query(query, (login_name,))
        return results
    except Exception as e:
        print(f"Error in get_user_sessions: {e}")
        return []

@app.get("/api/tables/usage", response_model=List[TableUsage])
def get_table_usage(
    server: str = Query(settings.sql_server),
    database: Optional[str] = None,
    limit: int = Query(20, ge=1, le=1000)
):
    try:
        db_conn = get_db_connection(server)
        
        # Use the specified query to get top 20 most frequently accessed tables
        query = f"""
        SELECT TOP {limit}
            DB_NAME(database_id) AS database_name,
            OBJECT_NAME(object_id, database_id) AS table_name,
            OBJECT_SCHEMA_NAME(object_id, database_id) AS schema_name,
            (user_seeks + user_scans + user_lookups) AS read_count,
            user_updates AS write_count,
            last_user_seek AS last_read,
            last_user_update AS last_write
        FROM sys.dm_db_index_usage_stats
        WHERE OBJECT_NAME(object_id, database_id) IS NOT NULL
        ORDER BY (user_seeks + user_scans + user_lookups) DESC
        """
        
        results = db_conn.execute_query(query)
        
        # Filter out any results with NULL names
        filtered_results = [r for r in results if r.get('table_name')]
        return filtered_results
    except Exception as e:
        print(f"Error in get_table_usage: {e}")
        import traceback
        traceback.print_exc()
        return []

@app.get("/api/tables/unused")
def get_unused_tables(
    server: str = Query(settings.sql_server),
    days: int = Query(30, ge=1)
):
    try:
        db_conn = get_db_connection(server)
        query = f"""
        SELECT 
            s.name as schema_name,
            t.name as table_name,
            DB_NAME() as database_name
        FROM sys.tables t
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE t.object_id NOT IN (
            SELECT object_id 
            FROM sys.dm_db_index_usage_stats
            WHERE database_id = DB_ID()
            AND (last_user_seek IS NOT NULL OR last_user_scan IS NOT NULL 
                 OR last_user_lookup IS NOT NULL OR last_user_update IS NOT NULL)
            AND (last_user_seek > DATEADD(day, -{days}, GETDATE())
                 OR last_user_scan > DATEADD(day, -{days}, GETDATE())
                 OR last_user_lookup > DATEADD(day, -{days}, GETDATE())
                 OR last_user_update > DATEADD(day, -{days}, GETDATE()))
        )
        """
        results = db_conn.execute_query(query)
        return results
    except Exception as e:
        print(f"Error in get_unused_tables: {e}")
        return []

@app.get("/api/sessions/sleeping")
def get_sleeping_sessions(
    server: str = Query(settings.sql_server),
    idle_minutes: int = Query(30, ge=1)
):
    """Get sessions that have been sleeping or suspended for more than specified minutes"""
    try:
        db_conn = get_db_connection(server)
        query = f"""
        SELECT 
            session_id,
            status,
            login_name,
            host_name,
            program_name,
            login_time,
            last_request_end_time,
            DATEDIFF(MINUTE, last_request_end_time, GETDATE()) as idle_minutes
        FROM sys.dm_exec_sessions
        WHERE status IN ('sleeping', 'suspended')
        AND is_user_process = 1
        AND DATEDIFF(MINUTE, last_request_end_time, GETDATE()) > {idle_minutes}
        AND session_id <> @@SPID
        ORDER BY idle_minutes DESC
        """
        results = db_conn.execute_query(query)
        return results
    except Exception as e:
        print(f"Error in get_sleeping_sessions: {e}")
        import traceback
        traceback.print_exc()
        return []

@app.post("/api/sessions/terminate-sleeping")
def terminate_sleeping_sessions(
    server: str = Query(settings.sql_server),
    idle_minutes: int = Query(30, ge=1)
):
    """Terminate all sleeping sessions idle for more than specified minutes"""
    try:
        db_conn = get_db_connection(server)

        # Step 1: Count sessions that will be killed
        count_query = f"""
        SELECT COUNT(*) as session_count
        FROM sys.dm_exec_sessions
        WHERE status = 'sleeping'
        AND is_user_process = 1
        AND DATEDIFF(MINUTE, last_request_end_time, GETDATE()) > {idle_minutes}
        AND session_id <> @@SPID
        """
        count_result = db_conn.execute_query(count_query)
        session_count = count_result[0]['session_count'] if count_result else 0

        if session_count == 0:
            return {
                "success": True,
                "terminated_count": 0,
                "message": "No sleeping sessions found to terminate"
            }

        # Step 2: Execute the exact KILL query as a single batch
        kill_query = f"""
        DECLARE @sql NVARCHAR(MAX) = '';
        SELECT @sql = @sql + 'KILL ' + CAST(session_id AS VARCHAR) + ';'
        FROM sys.dm_exec_sessions
        WHERE status = 'sleeping'
        AND is_user_process = 1
        AND DATEDIFF(MINUTE, last_request_end_time, GETDATE()) > {idle_minutes}
        AND session_id <> @@SPID;
        EXEC(@sql);
        """

        db_conn.execute_non_query(kill_query)
        print(f"Terminated {session_count} sleeping session(s)")

        return {
            "success": True,
            "terminated_count": session_count,
            "message": f"Successfully terminated {session_count} sleeping session(s)"
        }
    except Exception as e:
        print(f"Error in terminate_sleeping_sessions: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to terminate sessions: {str(e)}")

@app.get("/health")
def health_check():
    try:
        db.execute_query("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
