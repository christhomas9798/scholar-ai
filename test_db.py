import sqlite3, os
from passlib.context import CryptContext
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
conn = sqlite3.connect("../scholar-ai/scholar.db")
row = conn.execute('SELECT * FROM "User" LIMIT 1').fetchone()
print(row)
print(pwd_ctx.verify("Principal@2025!", "$2b$10$xyz"))
