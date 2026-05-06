import pyodbc
from config import settings
from typing import List, Dict, Any

class SQLServerConnection:
    def __init__(self, server: str = None):
        self.server = server or settings.sql_server
        self._init_connection_strings()
    
    def _init_connection_strings(self):
        # Pick credentials for this specific server, fall back to defaults
        creds = settings.server_credentials.get(self.server)
        if creds:
            username = creds["username"]
            password = creds["password"]
        else:
            username = settings.sql_username
            password = settings.sql_password

        # Use Windows Authentication only if username is blank or 'windows'
        if not username or username.lower() == 'windows':
            self.conn_str = (
                f"DRIVER={{ODBC Driver 13 for SQL Server}};"
                f"SERVER={self.server};"
                f"DATABASE={settings.sql_database};"
                f"Trusted_Connection=yes;"
                f"Connection Timeout=30;"
                f"ConnectRetryCount=3;"
                f"ConnectRetryInterval=10;"
            )
        else:
            self.conn_str = (
                f"DRIVER={{ODBC Driver 13 for SQL Server}};"
                f"SERVER={self.server};"
                f"DATABASE={settings.sql_database};"
                f"UID={username};"
                f"PWD={password};"
                f"Connection Timeout=30;"
                f"ConnectRetryCount=3;"
                f"ConnectRetryInterval=10;"
            )
    
    def execute_query(self, query: str, params: tuple = None) -> List[Dict[str, Any]]:
        max_retries = 3
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                with pyodbc.connect(self.conn_str, timeout=30) as conn:
                    cursor = conn.cursor()
                    if params:
                        cursor.execute(query, params)
                    else:
                        cursor.execute(query)
                    
                    if cursor.description is None:
                        return []
                    
                    columns = [column[0] for column in cursor.description]
                    results = []
                    for row in cursor.fetchall():
                        results.append(dict(zip(columns, row)))
                    return results
            except pyodbc.OperationalError as e:
                retry_count += 1
                if retry_count >= max_retries:
                    raise
                print(f"Connection failed, retrying ({retry_count}/{max_retries})...")
                import time
                time.sleep(2)
        
        return []
    
    def execute_non_query(self, query: str, params: tuple = None):
        with pyodbc.connect(self.conn_str, autocommit=True) as conn:
            cursor = conn.cursor()
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            conn.commit()

# Default connection
db = SQLServerConnection()

# Function to get connection for specific server
def get_db_connection(server: str) -> SQLServerConnection:
    return SQLServerConnection(server)
