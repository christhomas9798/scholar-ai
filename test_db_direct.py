import sqlite3, os
from database import query
from passlib.context import CryptContext
import traceback

print("DB PATH:", os.getenv("DATABASE_PATH", "./scholar.db"))

try:
    rows = query('SELECT email, password, role FROM "User" LIMIT 3')
    print("Found users:", len(rows))
    for r in rows:
        print(f"User email: {r['email']}, hash: {r['password'][:10]}..., role: {r['role']}")
        
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    v = pwd_ctx.verify("Principal@2025!", rows[0]['password'])
    print("Verify test:", v)
except Exception as e:
    print("ERROR:", e)
    traceback.print_exc()
