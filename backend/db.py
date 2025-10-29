import psycopg2
from psycopg2.extras import RealDictCursor

DB_CONFIG = {
    "dbname": "portfolio_db",
    "user": "sohamathawale",  # your PostgreSQL username
    "password": "",            # leave blank if no password
    "host": "localhost",
    "port": "5432"
}

def get_db_conn():
    """Create a PostgreSQL connection using global DB_CONFIG."""
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
