from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class RunningQuery(BaseModel):
    session_id: int
    login_name: str
    database_name: Optional[str]
    query_text: str
    start_time: datetime
    duration_seconds: int
    cpu_time: int
    logical_reads: int
    writes: int
    status: str
    host_name: Optional[str] = None
    blocking_session_id: Optional[int] = None

class LongRunningQuery(BaseModel):
    session_id: int
    login_name: str
    database_name: Optional[str]
    query_text: str
    execution_time_seconds: int
    cpu_time: int
    logical_reads: int
    writes: int

class ActiveUser(BaseModel):
    session_id: int
    login_name: str
    host_name: Optional[str]
    program_name: Optional[str]
    login_time: datetime
    status: str

class TableUsage(BaseModel):
    schema_name: str
    table_name: str
    database_name: str
    read_count: int
    write_count: int
    last_read: Optional[datetime]
    last_write: Optional[datetime]

class QueryStats(BaseModel):
    execution_count: int
    query_text: str
    avg_cpu_time: Optional[int] = None
    total_cpu_time: Optional[int] = None
    total_io: Optional[int] = None
    total_logical_reads: Optional[int] = None
    total_logical_writes: Optional[int] = None
    last_execution_time: datetime
