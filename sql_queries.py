RUNNING_QUERIES = """
SELECT 
    r.session_id,
    s.login_name,
    DB_NAME(r.database_id) as database_name,
    SUBSTRING(st.text, (r.statement_start_offset/2)+1,
        ((CASE r.statement_end_offset
            WHEN -1 THEN DATALENGTH(st.text)
            ELSE r.statement_end_offset
        END - r.statement_start_offset)/2) + 1) AS query_text,
    r.start_time,
    DATEDIFF(SECOND, r.start_time, GETDATE()) as duration_seconds,
    r.cpu_time,
    r.logical_reads,
    r.writes,
    r.status,
    s.host_name,
    r.blocking_session_id
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
WHERE r.session_id != @@SPID
AND CAST(r.start_time AS DATE) = CAST(GETDATE() AS DATE)
"""

LONG_RUNNING_QUERIES = """
SELECT TOP 10
    r.session_id,
    s.login_name,
    DB_NAME(r.database_id) as database_name,
    SUBSTRING(st.text, (r.statement_start_offset/2)+1,
        ((CASE r.statement_end_offset
            WHEN -1 THEN DATALENGTH(st.text)
            ELSE r.statement_end_offset
        END - r.statement_start_offset)/2) + 1) AS query_text,
    DATEDIFF(SECOND, r.start_time, GETDATE()) as execution_time_seconds,
    r.cpu_time,
    r.logical_reads,
    r.writes
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
WHERE DATEDIFF(SECOND, r.start_time, GETDATE()) > 300
AND CAST(r.start_time AS DATE) = CAST(GETDATE() AS DATE)
ORDER BY execution_time_seconds DESC
"""

ACTIVE_USERS = """
SELECT DISTINCT
    s.session_id,
    s.login_name,
    s.host_name,
    s.program_name,
    s.login_time,
    s.status
FROM sys.dm_exec_sessions s
WHERE s.is_user_process = 1
"""

TOP_CPU_QUERIES = """
SELECT TOP 10
    qs.execution_count,
    SUBSTRING(st.text, (qs.statement_start_offset/2)+1,
        ((CASE qs.statement_end_offset
            WHEN -1 THEN DATALENGTH(st.text)
            ELSE qs.statement_end_offset
        END - qs.statement_start_offset)/2) + 1) AS query_text,
    qs.total_worker_time / qs.execution_count as avg_cpu_time,
    qs.total_worker_time as total_cpu_time,
    qs.last_execution_time
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
WHERE CAST(qs.last_execution_time AS DATE) = CAST(GETDATE() AS DATE)
ORDER BY qs.total_worker_time DESC
"""

TOP_IO_QUERIES = """
SELECT TOP 10
    qs.execution_count,
    SUBSTRING(st.text, (qs.statement_start_offset/2)+1,
        ((CASE qs.statement_end_offset
            WHEN -1 THEN DATALENGTH(st.text)
            ELSE qs.statement_end_offset
        END - qs.statement_start_offset)/2) + 1) AS query_text,
    qs.total_logical_reads + qs.total_logical_writes as total_io,
    qs.total_logical_reads,
    qs.total_logical_writes,
    qs.last_execution_time
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
WHERE CAST(qs.last_execution_time AS DATE) = CAST(GETDATE() AS DATE)
ORDER BY total_io DESC
"""
