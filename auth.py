"""
auth.py — JWT-based authentication for ScholarAI FastAPI backend.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Cookie, HTTPException, Request, status
from jose import JWTError, jwt
import bcrypt
from database import query

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def authenticate_user(email: str, password: str) -> Optional[dict]:
    """Verify credentials against SQLite. Returns user dict or None."""
    rows = query('SELECT id, email, password, name, role FROM "User" WHERE email = ? AND isActive = 1', (email,))
    if not rows:
        return None
    user = rows[0]
    if not verify_password(password, user["password"]):
        return None
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


def get_current_user(request: Request) -> dict:
    """Dependency: extract and validate JWT from cookie. Raises 401 if missing/invalid."""
    token = request.cookies.get("scholar_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_303_SEE_OTHER,
            detail="Not authenticated",
            headers={"Location": "/login"},
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=303, headers={"Location": "/login"})
        return {
            "id": payload.get("sub"),
            "email": payload.get("email"),
            "name": payload.get("name"),
            "role": payload.get("role"),
        }
    except JWTError:
        raise HTTPException(status_code=303, headers={"Location": "/login"})


def require_role(*roles: str):
    """Factory for role-checking dependencies."""
    def _check(request: Request) -> dict:
        user = get_current_user(request)
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Access denied")
        return user
    return _check
