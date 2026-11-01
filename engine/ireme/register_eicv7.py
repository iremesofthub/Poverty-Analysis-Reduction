"""Register the fixed EICV7 poverty input after its signed NISR approval is in hand."""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import os
from pathlib import Path
import re

from . import data_eicv7, science
from .catalog import Catalog


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def register(args):
    if not args.confirm_signed_approval:
        raise ValueError('The NISR approval must be signed before registration')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', args.permission_id):
        raise ValueError('Permission ID must use letters, numbers, dot, underscore, or hyphen')
    source = data_eicv7.zip_path().resolve(strict=True)
    evidence = Path(args.evidence).resolve(strict=True)
    catalog_path = Path(args.catalog).resolve()
    data_hash = sha256_file(source)
    evidence_hash = sha256_file(evidence)
    dictionary_hash = data_eicv7.dictionary_fingerprint(source)
    catalog = Catalog(catalog_path, args.tenant, args.principal)
    try:
        catalog.dataset('eicv7', '1', data_hash, 'confidential_microdata', dictionary_hash,
                        retention_expires_at=args.expires)
        catalog.grant(args.permission_id, 'eicv7', '1', [args.purpose], args.starts, args.expires, evidence_hash)
        definition = {
            **science.MAPPING,
            'indicator_id': 'poverty',
            'definition_version': '1',
            'unit': 'fraction',
            'geography_version': 'EICV7 source district categories; boundary equivalence not implied',
            'source_dictionary_hash': dictionary_hash,
            'notes': f'EICV7 poverty headcount; restricted aggregate analysis only; '
                     f'governed by permission {args.permission_id}.',
        }
        catalog.indicator(definition)
    finally:
        catalog.close()
    return {'catalog': str(catalog_path), 'dataset_id': 'eicv7', 'dataset_version': '1',
            'permission_id': args.permission_id, 'purpose': args.purpose,
            'expires': args.expires, 'dataset_sha256': data_hash,
            'dictionary_sha256': dictionary_hash, 'approval_evidence_sha256': evidence_hash}


def main(argv=None):
    parser = argparse.ArgumentParser(description='Register the EICV7 archive and signed dataset approval in the local governed catalog.')
    parser.add_argument('--catalog', default=os.environ.get('IREME_CATALOG_DB'), help='Must match IREME_CATALOG_DB used by the API')
    parser.add_argument('--tenant', required=True, help='Trusted tenant ID assigned to the signed-in analyst')
    parser.add_argument('--principal', required=True, help='Supabase user UUID of the authorized data steward')
    parser.add_argument('--permission-id', required=True, help='NISR approval/agreement reference')
    parser.add_argument('--purpose', required=True, help='Exact permitted analysis purpose from the approval')
    parser.add_argument('--starts', required=True, help='Approval start time with timezone, for example 2026-10-31T00:00:00Z')
    parser.add_argument('--expires', required=True, help='Approval expiry with timezone')
    parser.add_argument('--evidence', required=True, help='Path to the signed NISR approval document')
    parser.add_argument('--confirm-signed-approval', action='store_true', help='Confirm the supplied evidence is signed and approved for this purpose')
    args = parser.parse_args(argv)
    if not args.catalog:
        parser.error('Set IREME_CATALOG_DB or pass --catalog')
    try:
        # Validate ISO timestamps here for a clearer setup failure; Catalog checks timezone and interval.
        datetime.fromisoformat(args.starts.replace('Z', '+00:00'))
        datetime.fromisoformat(args.expires.replace('Z', '+00:00'))
        result = register(args)
    except Exception as exc:
        parser.error(f'Registration refused: {type(exc).__name__}: {exc}')
    print('EICV7 permission and indicator registered. Hashes are safe identifiers; source rows were not printed.')
    for key in ('dataset_id', 'dataset_version', 'permission_id', 'purpose', 'expires',
                'dataset_sha256', 'dictionary_sha256', 'approval_evidence_sha256'):
        print(f'{key}={result[key]}')


if __name__ == '__main__':
    main()
