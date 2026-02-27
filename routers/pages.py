"""
routers/pages.py — Server-side rendered page routes using Jinja2 templates.
"""

from fastapi import APIRouter, Depends, Request, Form, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from auth import authenticate_user, create_access_token, get_current_user, require_role
from database import query

router = APIRouter()
templates = Jinja2Templates(directory="templates")


# ── Login ──────────────────────────────────────────────────────────────────────
@router.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    token = request.cookies.get("scholar_token")
    if token:
        return RedirectResponse("/dashboard", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@router.post("/login")
async def login(request: Request, email: str = Form(...), password: str = Form(...)):
    user = authenticate_user(email, password)
    if not user:
        return templates.TemplateResponse("login.html",
            {"request": request, "error": "Invalid email or password"}, status_code=401)
    token = create_access_token({
        "sub": user["id"], "email": user["email"],
        "name": user["name"], "role": user["role"]
    })
    response = RedirectResponse("/dashboard", status_code=302)
    response.set_cookie("scholar_token", token, httponly=True, samesite="lax", max_age=86400)
    return response


@router.get("/logout")
def logout():
    response = RedirectResponse("/login", status_code=302)
    response.delete_cookie("scholar_token")
    return response


# ── Dashboard ─────────────────────────────────────────────────────────────────
@router.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request, user: dict = Depends(get_current_user)):
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": user})


# ── Students ──────────────────────────────────────────────────────────────────
@router.get("/dashboard/students", response_class=HTMLResponse)
def students_page(request: Request, user: dict = Depends(get_current_user)):
    return templates.TemplateResponse("students.html", {"request": request, "user": user})


# ── Teachers (Principal only) ────────────────────────────────────────────────
@router.get("/dashboard/teachers", response_class=HTMLResponse)
def teachers_page(request: Request, user: dict = Depends(get_current_user)):
    if user["role"] not in ("PRINCIPAL", "VICE_PRINCIPAL", "ADMIN"):
        return RedirectResponse("/dashboard", status_code=302)
    return templates.TemplateResponse("teachers.html", {"request": request, "user": user})


# ── Attendance ────────────────────────────────────────────────────────────────
@router.get("/dashboard/attendance", response_class=HTMLResponse)
def attendance_page(request: Request, user: dict = Depends(get_current_user)):
    return templates.TemplateResponse("attendance.html", {"request": request, "user": user})


# ── AI Chat ───────────────────────────────────────────────────────────────────
@router.get("/dashboard/chat", response_class=HTMLResponse)
def chat_page(request: Request, user: dict = Depends(get_current_user)):
    return templates.TemplateResponse("chat.html", {"request": request, "user": user})


# ── Root redirect ─────────────────────────────────────────────────────────────
@router.get("/")
def root():
    return RedirectResponse("/dashboard", status_code=302)
