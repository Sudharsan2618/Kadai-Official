"""Liveness + readiness.

/health stays free of I/O so a database blip never makes Cloud Run cycle a
healthy container; /health/ready actually touches the DB and is what a
deploy check or an uptime probe should call."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.settings import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {"ok": True, "version": settings.app.version, "env": settings.app.env}


@router.get("/health/ready")
def ready(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        return JSONResponse(status_code=503, content={"ok": False, "db": str(e)[:200]})
    return {"ok": True, "db": "up"}
