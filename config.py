from pydantic_settings import BaseSettings
from typing import Optional, Dict

class Settings(BaseSettings):
    # Default server
    sql_server: str = "10.60.70.14"
    sql_database: str = "master"
    sql_username: Optional[str] = "CDC_USER"
    sql_password: Optional[str] = "CDC@321#$"
    poll_interval_seconds: int = 60

    # Server display names
    sql_servers: Dict[str, str] = {
        "10.60.70.14": "Retail Server",
        "10.60.70.137": "Group Server"
    }

    # Per-server SQL credentials (username, password)
    # If a server is not listed here, falls back to sql_username/sql_password
    server_credentials: Dict[str, Dict[str, str]] = {
        "10.60.70.14": {"username": "CDC_USER",    "password": "CDC@321#$"},
        "10.60.70.137": {"username": "stagingdbusr", "password": "Dpl1@12#"},
    }

    class Config:
        env_file = ".env"

settings = Settings()
