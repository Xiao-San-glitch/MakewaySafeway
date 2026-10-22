import sqlite3
from pathlib import Path
from .core.config import settings
def connect():
    p = Path(settings.database_path); p.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(p); c.row_factory = sqlite3.Row
    c.execute('''CREATE TABLE IF NOT EXISTS hazards(id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL, lon REAL, category TEXT, description TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS contacts(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, consent INTEGER DEFAULT 0)''')
    c.commit(); return c
