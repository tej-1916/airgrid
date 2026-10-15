import logging
import sys
from airgrid.core.config import settings


def setup_logging() -> logging.Logger:
    level = logging.DEBUG if settings.AIRGRID_DEBUG else logging.INFO

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger("airgrid")
    root_logger.setLevel(level)

    # Avoid adding duplicate handlers if setup_logging is called multiple times
    if not root_logger.handlers:
        root_logger.addHandler(handler)

    return root_logger


logger = setup_logging()
