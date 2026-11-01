"""Governed, restartable EICV7 primary/reference research workflow.

This produces restricted research evidence, not certified facts. Independent
ownership and approved production tolerances are still mandatory before facts
can enter the claim compiler. No model provider participates in calculation.
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import platform
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd
import scipy

from . import contracts, data_eicv7, r_reference, survey

VERSION = 'eicv7-governed-research/1'
MAPPING = {'concept': 'Poverty headcount', 'survey_wave': 'EICV7', 'population': 'person', 'weight_variable': 'pop_wt',
           'strata_variable': 'strata_id', 'psu_variable': 'clust', 'missing_rule': 'reject',
           'numerator': 'pov_jan == Poor', 'denominator': 'all_resident_persons',
           'method_version': 'eicv7-poverty-taylor/1'}


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def code_snapshot():
    base = Path(__file__).parent
    names = ('science.py', 'survey.py', 'data_eicv7.py', 'r_reference.py', 'catalog.py', 'jobs.py', 'contracts.py')
    sources = {name: (base / name).read_text(encoding='utf-8') for name in names}
    sources['eicv7_survey.R'] = r_reference.SCRIPT.read_text(encoding='utf-8')
    return {'sources': sources, 'sha256': contracts.canonical_hash(sources)}


def prepare(catalog, jobs, dataset_id, dataset_version, permission_id, purpose,
            indicator_id, definition_version, idempotency_key, archive=None):
    """Validate authority and enqueue an immutable run without opening survey rows."""
    approved = catalog.authorize(permission_id, dataset_id, dataset_version, purpose)
    definition = catalog.get('indicator', indicator_id, definition_version)
    for key, expected in MAPPING.items():
        if definition.get(key) != expected:
            raise ValueError('Unsupported or unreviewed EICV7 mapping: ' + key)
    if definition.get('unit') not in ('fraction', 'percent'):
        raise ValueError('Poverty headcount requires fraction or percent units')
    if definition.get('source_dictionary_hash') != approved['dictionary_sha256']:
        raise ValueError('Indicator dictionary does not match approved dataset dictionary')
    path = Path(archive) if archive is not None else data_eicv7.zip_path()
    if sha256_file(path) != approved['sha256']:
        raise ValueError('Archive does not match authorized dataset revision')
    snapshot = code_snapshot()
    environment = {'python': platform.python_version(), 'numpy': np.__version__,
                   'pandas': pd.__version__, 'scipy': scipy.__version__,
                   'r_runtime': r_reference.runtime_fingerprint(),
                   'reference_packages': hashlib.sha256((r_reference.SCRIPT.parent / 'installed-packages.json').read_bytes()).hexdigest()}
    params = {'tenant': catalog.tenant, 'principal': catalog.principal, 'dataset_id': dataset_id,
              'dataset_version': dataset_version, 'dataset_sha256': approved['sha256'],
              'indicator_id': indicator_id, 'definition_version': definition_version,
              'indicator_sha256': contracts.canonical_hash(definition), 'permission_id': permission_id,
              'purpose': purpose, 'code_sha256': snapshot['sha256'], 'environment': environment}
    return jobs.submit('governed-science', params, catalog.tenant + ':' + idempotency_key, VERSION)


def resume(catalog, jobs, run_id, tenant, principal, archive=None):
    """Resume a queued or interrupted run only for its original tenant and actor."""
    info = jobs.run_info(run_id)
    params = info['params']
    if info['kind'] != 'governed-science' or (params.get('tenant'), params.get('principal')) != (tenant, principal):
        raise PermissionError('Research run is unavailable')
    idem = jobs.conn().execute('SELECT idem_key FROM runs WHERE run_id=?', (run_id,)).fetchone()
    if not idem:
        raise KeyError(run_id)
    prefix = catalog.tenant + ':'
    if not idem[0].startswith(prefix):
        raise PermissionError('Research run idempotency scope is invalid')
    # execute() applies the tenant prefix itself; remove it before resubmitting so
    # resume targets the same immutable run instead of creating a second one.
    raw_idempotency_key = idem[0][len(prefix):]
    return execute(catalog, jobs, params['dataset_id'], params['dataset_version'], params['permission_id'],
                   params['purpose'], params['indicator_id'], params['definition_version'], raw_idempotency_key, archive)


def execute(catalog, jobs, dataset_id, dataset_version, permission_id, purpose,
            indicator_id, definition_version, idempotency_key, archive=None):
    approved = catalog.authorize(permission_id, dataset_id, dataset_version, purpose)
    definition = catalog.get('indicator', indicator_id, definition_version)
    for key, expected in MAPPING.items():
        if definition.get(key) != expected:
            raise ValueError('Unsupported or unreviewed EICV7 mapping: ' + key)
    if definition.get('unit') not in ('fraction', 'percent'):
        raise ValueError('Poverty headcount requires fraction or percent units')
    if definition.get('source_dictionary_hash') != approved['dictionary_sha256']:
        raise ValueError('Indicator dictionary does not match approved dataset dictionary')
    path = Path(archive) if archive is not None else data_eicv7.zip_path()
    if sha256_file(path) != approved['sha256']:
        raise ValueError('Archive does not match authorized dataset revision')
    snapshot = code_snapshot()
    environment = {'python': platform.python_version(), 'numpy': np.__version__,
                   'pandas': pd.__version__, 'scipy': scipy.__version__,
                   'r_runtime': r_reference.runtime_fingerprint(),
                   'reference_packages': hashlib.sha256((r_reference.SCRIPT.parent / 'installed-packages.json').read_bytes()).hexdigest()}
    params = {'tenant': catalog.tenant, 'principal': catalog.principal, 'dataset_id': dataset_id,
              'dataset_version': dataset_version, 'dataset_sha256': approved['sha256'],
              'indicator_id': indicator_id, 'definition_version': definition_version,
              'indicator_sha256': contracts.canonical_hash(definition), 'permission_id': permission_id,
              'purpose': purpose, 'code_sha256': snapshot['sha256'], 'environment': environment}
    run_id = jobs.submit('governed-science', params, catalog.tenant + ':' + idempotency_key, VERSION)

    def guard():
        catalog.authorize(permission_id, dataset_id, dataset_version, purpose)
        if sha256_file(path) != approved['sha256']:
            raise ValueError('Archive changed during scientific run')
        if code_snapshot()['sha256'] != snapshot['sha256']:
            raise ValueError('Scientific implementation changed during run')

    def primary(_params, _upstream):
        frame, sha = data_eicv7.load_governed(catalog, dataset_id, dataset_version, permission_id, purpose, path)
        design, y = data_eicv7.person_design(frame), data_eicv7.poor_indicator(frame)
        if not frame.hhid.is_unique or frame[['hhid', 'clust', 'strata_id', 'pov_jan']].isna().any().any():
            raise ValueError('Missing design fields or duplicate household identifiers')
        if not set(frame.pov_jan.astype(str)).issubset({'Poor', 'Non Poor'}):
            raise ValueError('Unexpected poverty response labels')
        if frame.district.isna().any() or frame.district.nunique() != 30:
            raise ValueError('Expected exactly 30 district domains')
        estimates, contrasts = [], []
        national_mask = np.ones(len(frame), bool)
        for geography in ['Rwanda', *sorted(frame.district.unique())]:
            mask = national_mask if geography == 'Rwanda' else (frame.district == geography).to_numpy()
            estimate = survey.ratio_estimate(design, y, domain=mask, expected_unit='person')
            estimates.append({'geography': geography, **asdict(estimate),
                              'reliability': survey.reliability_grade(estimate)})
            if geography != 'Rwanda':
                contrast = survey.difference_estimate(design, y, None, mask, national_mask)
                contrasts.append({'geography': geography, 'comparator': 'Rwanda', **asdict(contrast)})
        guard()
        return {'dataset_sha256': sha, 'unit': 'fraction', 'estimates': estimates, 'contrasts': contrasts}

    def reference(_params, _upstream):
        guard()
        result = r_reference.calculate(path)
        guard()
        return result

    def reconcile(_params, upstream):
        p, r = upstream['primary'], upstream['reference']
        if p['dataset_sha256'] != r['dataset_sha256']:
            raise ValueError('Primary/reference raw origins differ')
        differences = []
        for quantity in ('estimates', 'contrasts'):
            official = {row['geography']: row for row in r[quantity]}
            for row in p[quantity]:
                ref = official.pop(row['geography'])
                differences.append({'quantity': quantity, 'geography': row['geography'],
                    'point_difference': row['point'] - ref['point'], 'se_difference': row['se'] - ref['se'],
                    'ci_methods': {'python': row['ci_method'], 'r': ref['ci_method']}})
            if official:
                raise ValueError('Reference coverage differs from primary coverage')
        guard()
        return {'status': 'restricted_draft', 'scientific_decision': 'methodology_review_required',
                'differences': differences, 'reasons': ['Independent ownership review pending',
                'Production tolerances and definitions require scientific approval',
                'Confidence interval method differences require review'], 'certified_fact_ids': []}

    def external(_params):
        guard()
        return {'dataset_sha256': approved['sha256'], 'code_sha256': snapshot['sha256']}

    trace = jobs.execute(run_id, [('primary', primary, external), ('reference', reference, external),
                                 ('reconciliation', reconcile, external)])
    guard()
    if r_reference.runtime_fingerprint() != environment['r_runtime']:
        raise ValueError('R reference environment changed during scientific run')
    summary = trace['outputs']['reconciliation']
    created = jobs.conn().execute('SELECT created FROM runs WHERE run_id=?', (run_id,)).fetchone()[0]
    commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=Path(__file__).resolve().parents[2],
                            capture_output=True, text=True, check=True).stdout.strip()
    rows = jobs.stage_rows(run_id)
    manifest = {'investigation_id': run_id, 'district_id': 'Rwanda', 'purpose': purpose,
        'created_at': datetime.fromtimestamp(created, timezone.utc).isoformat(),
        'data_snapshot_sha256': approved['sha256'], 'indicator_registry_sha256': params['indicator_sha256'],
        'code_commit': commit, 'workflow_version': VERSION, 'status': summary['status'],
        'science_environment_sha256': contracts.canonical_hash(environment),
        'stages': [{'stage_id': name, 'status': row['status'], 'input_sha256': row['input_hash'],
                    'output_sha256': row['output_hash']} for name, row in rows.items()]}
    contracts.validate('investigation-manifest', manifest)
    payload = {'workflow_version': VERSION, 'run_id': run_id, 'inputs': params,
               'definition': definition, 'code_snapshot': snapshot, 'trace_hash': trace['trace_hash'],
               'manifest': manifest, **summary}
    catalog._insert('scientific-run', run_id, '1', payload)
    root, target = ('dataset', dataset_id, dataset_version), ('scientific-run', run_id, '1')
    if not any(edge['child'] == target for edge in catalog.lineage(root)):
        catalog.link(root, target, snapshot['sha256'], permission_id, purpose)
    return {'run_id': run_id, 'trace': trace, 'result': payload}
