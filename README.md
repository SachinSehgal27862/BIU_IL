# SQL Server Audit & Monitoring Web Application

A Python-based REST API application for real-time SQL Server monitoring, auditing, and performance analysis.

## Features

- 🎨 Beautiful modern web dashboard
- ⚡ Real-time query monitoring with execution metrics
- ⏱️ Long-running query detection (>5 minutes)
- 👥 User activity tracking and audit trails
- 📊 Table usage analytics
- 🔥 Top CPU and I/O consuming queries
- 📈 Historical data collection
- 🔄 Auto-refresh every 30 seconds
- 📱 Responsive design
- 🎯 RESTful API with filtering and pagination

## Architecture

- **Backend**: FastAPI (Python)
- **Database**: SQL Server with monitoring database
- **Data Collection**: Async background tasks polling DMVs
- **API**: RESTful endpoints with query parameters

## Setup

1. Install dependencies:
```cmd
setup.bat
```

Or manually:
```cmd
pip install -r requirements.txt
```

2. Configure environment:
The `.env` file is already created with Windows Authentication.
Edit if needed to change server or database names.

3. Create monitoring database and tables:
```sql
CREATE DATABASE SQLServerMonitoring;
GO
USE SQLServerMonitoring;
GO
-- Run SQL/Create table Script.sql
```

4. Run the application:
```cmd
run.bat
```

Or manually:
```cmd
python Main.py
```

5. Open your browser:
```
http://localhost:8000
```

The beautiful dashboard UI will load automatically!

## API Endpoints

### Query Monitoring
- `GET /api/queries/running` - Current running queries
- `GET /api/queries/long-running` - Long-running queries (>5 min)
- `GET /api/queries/long-running/history` - Historical long-running queries
- `GET /api/queries/top-cpu` - Top CPU consuming queries
- `GET /api/queries/top-io` - Top I/O consuming queries

### User Auditing
- `GET /api/users/active` - Currently active users
- `GET /api/users/list` - List of all users
- `GET /api/users/{login_name}/queries` - Queries by user
- `GET /api/users/{login_name}/tables` - Tables accessed by user
- `GET /api/users/{login_name}/sessions` - User session history

### Table Analytics
- `GET /api/tables/usage` - Table usage statistics
- `GET /api/tables/unused` - Unused tables

### System
- `GET /health` - Health check
- `GET /` - API info

## Query Parameters

Most endpoints support filtering:
- `database` - Filter by database name
- `login` - Filter by login name
- `host` - Filter by host name
- `limit` - Result limit (default: 10-100)
- `start_date` / `end_date` - Date range filtering

## Example Usage

```bash
# Get running queries
curl http://localhost:8000/api/queries/running

# Get long-running queries for specific database
curl "http://localhost:8000/api/queries/long-running?database=MyDB&limit=20"

# Get user activity
curl http://localhost:8000/api/users/sa/queries

# Get table usage
curl "http://localhost:8000/api/tables/usage?limit=50"
```

## Interactive API Documentation

Visit `http://localhost:8000/docs` for Swagger UI API documentation.

## Dashboard Features

The web UI provides:

- **Overview Dashboard**: Real-time statistics and top queries
- **Running Queries**: Live view of all executing queries with filters
- **Long Running**: Queries exceeding 5 minutes execution time
- **Users**: Active user sessions and detailed activity per user
- **Tables**: Usage statistics and unused table detection

All data automatically refreshes and shows only current day information.

## Configuration

Edit `config.py` or `.env` to adjust:
- SQL Server connection details
- Monitoring database name
- Poll interval (default: 60 seconds)

## Security Notes

- Use read-only credentials for monitoring
- Restrict network access to monitoring API
- Enable HTTPS in production
- Implement authentication/authorization as needed
