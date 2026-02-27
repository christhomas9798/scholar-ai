"""
main.py — FastAPI application entry point for ScholarAI (Python backend).
"""

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import init_db
from routers.pages import router as pages_router
from routers.api import router as api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run DB initialization on startup."""
    init_db()
    yield


app = FastAPI(
    title="ScholarAI",
    description="AI-powered school management system — Python/FastAPI backend",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(pages_router)
app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
