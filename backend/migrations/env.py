from alembic import context

from app import models  # noqa: F401  (register tables)
from app.db import Base, engine

target_metadata = Base.metadata


def run_migrations() -> None:
    # The URL comes from app settings (DATABASE_URL), never from alembic.ini.
    connectable = context.config.attributes.get("connection") or engine
    if hasattr(connectable, "connect"):
        with connectable.connect() as connection:
            _run(connection)
    else:
        _run(connectable)


def _run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=connection.dialect.name == "sqlite",  # SQLite can't ALTER columns in place
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


run_migrations()
