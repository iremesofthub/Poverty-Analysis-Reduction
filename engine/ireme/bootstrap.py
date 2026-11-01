"""HACKATHON_DEMO bootstrap: seed the governed catalog on a fresh machine.

The demonstration profile already ships bypasses for human approvals and
production infrastructure (see profiles.py). This module registers the EICV7
archive, the hackathon dataset permission and the poverty indicator into the
machine catalog at startup, so a signed-in panel can start a governed run
immediately after the machine boots. Registration is idempotent: an existing
catalog revision is left untouched. Outside the demonstration profile (or
without a configured catalog) it does nothing.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PERMISSION_ID = 'nisr-hackathon-2026'
TENANT = 'nisr-hackathon'
PRINCIPAL = '44bbe7cf-723c-45f4-9705-2261ba016f7f'
PURPOSE = 'research'
STARTS = '2026-10-31T00:00:00Z'
EXPIRES = '2026-12-31T23:59:59Z'


def main(argv=None) -> int:
    if os.environ.get('IREME_PROFILE') != 'HACKATHON_DEMO':
        print('bootstrap: IREME_PROFILE is not HACKATHON_DEMO; leaving the catalog untouched')
        return 0
    catalog_db = os.environ.get('IREME_CATALOG_DB', '')
    if not catalog_db:
        print('bootstrap: IREME_CATALOG_DB is not set; leaving the catalog untouched')
        return 0
    evidence = Path('/app/demo/NISR_DATA_REQUEST.md')
    if not evidence.is_file():
        local = Path(__file__).resolve().parents[2] / 'docs' / 'NISR_DATA_REQUEST.md'
        if local.is_file():
            evidence = local
    if not evidence.is_file():
        print(f'bootstrap: evidence file {evidence} is missing; leaving the catalog untouched', file=sys.stderr)
        return 0

    from . import register_eicv7

    args = argparse.Namespace(
        confirm_signed_approval=True,
        permission_id=PERMISSION_ID,
        evidence=str(evidence),
        catalog=catalog_db,
        tenant=TENANT,
        principal=PRINCIPAL,
        purpose=PURPOSE,
        starts=STARTS,
        expires=EXPIRES,
    )
    try:
        result = register_eicv7.register(args)
    except Exception as exc:  # startup path only; never prevent the API from booting
        print(f'bootstrap: registration refused ({type(exc).__name__}: {exc})', file=sys.stderr)
        return 0
    print(f"bootstrap: EICV7 permission and indicator registered "
          f"({result['permission_id']}, {result['purpose']}, expires {result['expires']})")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
