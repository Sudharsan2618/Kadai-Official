"""Logging setup.

Locally: normal readable lines. On Cloud Run: one JSON object per line, with
the `severity` and `message` keys Cloud Logging indexes — turn it on with
JSON_LOGS=true so tracebacks stay attached to a single log entry instead of
being split across dozens."""
import json
import logging
import sys

from app.settings import settings

# Python level names → Cloud Logging severities.
_SEVERITY = {
    "DEBUG": "DEBUG", "INFO": "INFO", "WARNING": "WARNING",
    "ERROR": "ERROR", "CRITICAL": "CRITICAL",
}


class CloudRunJsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "severity": _SEVERITY.get(record.levelname, "DEFAULT"),
            "message": record.getMessage(),
            "logger": record.name,
        }
        if record.exc_info:
            entry["stack_trace"] = self.formatException(record.exc_info)
        extra = getattr(record, "context", None)
        if isinstance(extra, dict):
            entry.update(extra)
        return json.dumps(entry, default=str)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    if settings.app.json_logs:
        handler.setFormatter(CloudRunJsonFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)-7s %(name)s — %(message)s", "%H:%M:%S"))

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.app.log_level.upper())
    # uvicorn installs its own handlers; make them go through ours.
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True
