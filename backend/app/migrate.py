"""Bring the database schema up to date. Run before the web server starts.

Databases created by v1.0 (via create_all, before migrations existed) have
the baseline tables but no alembic_version table; stamp them at the baseline
so upgrades apply cleanly instead of trying to recreate existing tables."""

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from .db import engine

log = logging.getLogger("prana.migrate")
_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def upgrade() -> None:
    cfg = Config(str(_INI))
    tables = set(inspect(engine).get_table_names())
    if "users" in tables and "alembic_version" not in tables:
        log.info("Pre-migration database detected; stamping baseline 0001")
        command.stamp(cfg, "0001")
    command.upgrade(cfg, "head")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    upgrade()
