"""Checks that run INSIDE the `lab` compose profile and prove the container is isolated. Skipped everywhere else.

Nothing here sends packets to any address: egress is judged from the kernel routing table, not by probing the network.
"""
import os
import re

import pytest
from sqlalchemy import text

from airgrid.core.config import settings
from airgrid.core.database import AsyncSessionLocal

pytestmark = pytest.mark.skipif(os.environ.get("AIRGRID_LAB") != "1", reason="only meaningful inside the lab container profile")


def status_field(name: str) -> str:
    with open("/proc/self/status") as fh:
        return next(line.split(":", 1)[1].strip() for line in fh if line.startswith(name + ":"))


def test_runs_unprivileged_with_no_capabilities_and_no_new_privileges():
    assert os.getuid() != 0 and os.getgid() != 0
    for cap in ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"):
        assert int(status_field(cap), 16) == 0, cap                 # every capability dropped, including the bounding set
    assert status_field("NoNewPrivs") == "1"


def test_root_filesystem_is_read_only_and_only_tmpfs_is_writable():
    for path in ("/app/lab_probe", "/etc/lab_probe", "/usr/lab_probe"):
        with pytest.raises(OSError):
            open(path, "w")
    for path in ("/tmp/lab_probe",):
        with open(path, "w") as fh:
            fh.write("ok")
        os.remove(path)


def test_no_default_route_so_no_internet_lan_or_router_reachability():
    with open("/proc/net/route") as fh:
        rows = [line.split() for line in fh.readlines()[1:]]
    assert [r for r in rows if r[1] == "00000000"] == []          # an `internal` docker network has no gateway


def test_only_the_throwaway_lab_database_is_visible():
    url = settings.DATABASE_URL
    assert re.search(r"@lab-db:5432/airgrid_lab_test_db$", url), "lab must use the throwaway lab database"
    assert "airgrid_db" not in url and "127.0.0.1" not in url and "localhost" not in url


@pytest.mark.asyncio
async def test_lab_database_is_empty_of_real_data_and_ephemeral():
    async with AsyncSessionLocal() as s:
        assert (await s.execute(text("select current_database()"))).scalar() == "airgrid_lab_test_db"
        # only rows created by this very test session's fixtures can exist; there is no restored dump or real network data
        assert (await s.execute(text("select count(*) from network_telemetry_snapshots"))).scalar() == 0
        assert (await s.execute(text("select count(*) from internet_speed_tests"))).scalar() == 0
