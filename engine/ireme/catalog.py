"""Persistent versioned scientific metadata and lineage.

The local SQLite adapter preserves immutable revisions. Production deployment must
provide the same transaction boundaries in Postgres and authenticate the principal
before constructing this adapter; caller-supplied tenant names are not authentication.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from datetime import datetime, timezone

from .contracts import validate
from . import retention
from .sqlite_support import enable_wal


class RevisionConflict(ValueError):
    pass


class CatalogIntegrityError(ValueError):
    pass


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(encode(value).encode()).hexdigest()


def aware_date(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Permission dates require a timezone')
    return parsed


SCHEMA = '''
  CREATE TABLE IF NOT EXISTS revisions(
    tenant TEXT NOT NULL, kind TEXT NOT NULL, entity TEXT NOT NULL, version TEXT NOT NULL,
    payload TEXT NOT NULL, sha256 TEXT NOT NULL, actor TEXT NOT NULL, created TEXT NOT NULL,
    PRIMARY KEY(tenant,kind,entity,version));
  CREATE TABLE IF NOT EXISTS edges(
    tenant TEXT NOT NULL, parent_kind TEXT NOT NULL, parent TEXT NOT NULL, parent_version TEXT NOT NULL,
    child_kind TEXT NOT NULL, child TEXT NOT NULL, child_version TEXT NOT NULL,
    metadata TEXT NOT NULL, sha256 TEXT NOT NULL,
    PRIMARY KEY(tenant,parent_kind,parent,parent_version,child_kind,child,child_version));
  CREATE TRIGGER IF NOT EXISTS revision_no_update BEFORE UPDATE ON revisions
    BEGIN SELECT RAISE(ABORT,'immutable revision'); END;
  CREATE TRIGGER IF NOT EXISTS revision_no_delete BEFORE DELETE ON revisions
    BEGIN SELECT RAISE(ABORT,'immutable revision'); END;
  CREATE TRIGGER IF NOT EXISTS edge_no_update BEFORE UPDATE ON edges
    BEGIN SELECT RAISE(ABORT,'immutable lineage'); END;
  CREATE TRIGGER IF NOT EXISTS edge_no_delete BEFORE DELETE ON edges
    BEGIN SELECT RAISE(ABORT,'immutable lineage'); END;
'''


def connect(path):
    """Open the catalog, retrying only transient lock contention.

    The analyst console reads permissions, indicators, and runs in parallel, so a
    cold database can be initialised by several connections at once. SQLite
    reports that race as ``database is locked`` instead of waiting for the DDL.
    Retry briefly so a first page load never shows a spurious 500; any other
    failure still surfaces immediately.
    """
    for attempt in range(6):
        db = sqlite3.connect(path, timeout=30)
        try:
            db.execute('PRAGMA foreign_keys=ON')
            enable_wal(db)
            db.executescript(SCHEMA)
            return db
        except sqlite3.OperationalError as exc:
            db.close()
            if 'locked' not in str(exc) and 'busy' not in str(exc):
                raise
            if attempt == 5:
                raise
            time.sleep(0.05 * (2 ** attempt))
    raise AssertionError('unreachable')


class Catalog:
    def __init__(self, path, tenant: str, principal: str):
        if not tenant or not principal:
            raise PermissionError('Tenant and authenticated principal required')
        self.tenant, self.principal = tenant, principal
        self.db = connect(path)

    def close(self):
        self.db.close()

    def _insert(self, kind, entity, version, value):
        if not entity or not version:
            raise ValueError('Versioned identity required')
        payload = encode(value)
        checksum = digest(value)
        with self.db:
            existing = self.db.execute('SELECT sha256 FROM revisions WHERE tenant=? AND kind=? AND entity=? AND version=?',
                                      (self.tenant, kind, entity, version)).fetchone()
            if existing:
                if existing[0] != checksum:
                    raise RevisionConflict('Corrections require a new revision')
                self.get(kind, entity, version)  # Detect corruption before idempotent success.
                return checksum
            self.db.execute('INSERT INTO revisions VALUES(?,?,?,?,?,?,?,?)',
                            (self.tenant, kind, entity, version, payload, checksum, self.principal,
                             datetime.now(timezone.utc).isoformat()))
        return checksum

    def get(self, kind, entity, version):
        row = self.db.execute('SELECT payload,sha256 FROM revisions WHERE tenant=? AND kind=? AND entity=? AND version=?',
                              (self.tenant, kind, entity, version)).fetchone()
        if not row:
            raise KeyError((kind, entity, version))
        value = json.loads(row[0])
        if digest(value) != row[1]:
            raise CatalogIntegrityError('Catalog revision hash mismatch')
        return value

    def indicator(self, definition):
        validate('indicator-definition', definition)
        return self._insert('indicator', definition['indicator_id'], definition['definition_version'], definition)

    def dataset(self, dataset_id, version, sha256, sensitivity, dictionary_sha256, retention_expires_at=None):
        for h in (sha256, dictionary_sha256):
            if len(h) != 64 or any(c not in '0123456789abcdef' for c in h):
                raise ValueError('Full lowercase SHA256 required')
        if sensitivity not in ('public', 'restricted_aggregate', 'confidential_microdata', 'beneficiary_operational'):
            raise ValueError('Explicit supported sensitivity required')
        payload = {'sha256': sha256, 'sensitivity': sensitivity, 'dictionary_sha256': dictionary_sha256}
        if retention_expires_at is not None:
            aware_date(retention_expires_at)          # retention must be an explicit, timezone-aware instant
            payload['retention_expires_at'] = retention_expires_at
        return self._insert('dataset', dataset_id, version, payload)

    def grant(self, permission_id, dataset_id, dataset_version, purposes, starts, expires, evidence_sha256):
        dataset = self.get('dataset', dataset_id, dataset_version)
        if not purposes or not all(isinstance(p, str) and p.strip() for p in purposes):
            raise ValueError('Explicit permitted purposes required')
        if aware_date(expires) <= aware_date(starts):
            raise ValueError('Permission must have a positive validity interval')
        if len(evidence_sha256) != 64 or any(c not in '0123456789abcdef' for c in evidence_sha256):
            raise ValueError('Permission evidence SHA256 required')
        return self._insert('permission', permission_id, '1', {'dataset_id': dataset_id,
            'dataset_version': dataset_version, 'dataset_sha256': dataset['sha256'],
            'purposes': sorted(set(purposes)), 'starts': starts, 'expires': expires, 'evidence_sha256': evidence_sha256})

    def permissions(self, at=None):
        """Permission records for this tenant with validity and revocation state.

        Only catalog metadata is returned; the licensed dataset itself is never read
        here. Each payload is re-hashed so a tampered revision surfaces as an
        integrity error instead of being offered to the analyst.
        """
        at = at or datetime.now(timezone.utc)
        rows = self.db.execute("SELECT entity, payload, sha256 FROM revisions "
                               "WHERE tenant=? AND kind='permission' ORDER BY entity", (self.tenant,)).fetchall()
        revoked = {row[0] for row in self.db.execute(
            "SELECT entity FROM revisions WHERE tenant=? AND kind='revocation'", (self.tenant,))}
        out = []
        for entity, payload, checksum in rows:
            value = json.loads(payload)
            if digest(value) != checksum:
                raise CatalogIntegrityError('Catalog revision hash mismatch')
            out.append({'permission_id': entity,
                        'dataset_id': value['dataset_id'],
                        'dataset_version': value['dataset_version'],
                        'purposes': value['purposes'],
                        'starts': value['starts'],
                        'expires': value['expires'],
                        'revoked': entity in revoked,
                        'active': entity not in revoked and aware_date(value['starts']) <= at < aware_date(value['expires'])})
        return out

    def indicators(self):
        """Registered indicator definitions available to this tenant (metadata only)."""
        rows = self.db.execute("SELECT entity, version, payload, sha256 FROM revisions "
                               "WHERE tenant=? AND kind='indicator' ORDER BY entity, version", (self.tenant,)).fetchall()
        out = []
        for entity, version, payload, checksum in rows:
            value = json.loads(payload)
            if digest(value) != checksum:
                raise CatalogIntegrityError('Catalog revision hash mismatch')
            out.append({'indicator_id': entity, 'definition_version': version,
                        'unit': value.get('unit'), 'sha256': checksum})
        return out

    def revoke(self, permission_id, reason):
        self.get('permission', permission_id, '1')
        if not reason.strip():
            raise ValueError('Revocation reason required')
        return self._insert('revocation', permission_id, '1', {'reason': reason})

    def authorize(self, permission_id, dataset_id, dataset_version, purpose, at=None):
        permission = self.get('permission', permission_id, '1')
        try:
            self.get('revocation', permission_id, '1')
        except KeyError:
            pass
        else:
            raise PermissionError('Dataset permission revoked')
        at = at or datetime.now(timezone.utc)
        if at.tzinfo is None:
            raise ValueError('Authorization time requires timezone')
        if (permission['dataset_id'], permission['dataset_version']) != (dataset_id, dataset_version):
            raise PermissionError('Permission does not cover this dataset revision')
        if not aware_date(permission['starts']) <= at < aware_date(permission['expires']):
            raise PermissionError('Dataset permission is not currently valid')
        if purpose not in permission['purposes']:
            raise PermissionError('Dataset permission does not cover purpose')
        dataset = self.get('dataset', dataset_id, dataset_version)
        if dataset['sha256'] != permission['dataset_sha256']:
            raise CatalogIntegrityError('Permission does not bind dataset hash')
        retention.enforce(dataset, at)
        return dataset

    def retention_status(self, at=None):
        """Explicit retention view for the licensed datasets in this tenant (no raw rows)."""
        at = at or datetime.now(timezone.utc)
        rows = self.db.execute("SELECT entity, version, payload FROM revisions "
                               "WHERE tenant=? AND kind='dataset'", (self.tenant,)).fetchall()
        out = []
        for entity, version, payload in rows:
            dataset = json.loads(payload)
            end = retention.retention_end(dataset)
            out.append({'dataset_id': entity, 'version': version,
                        'retention_expires_at': dataset.get('retention_expires_at'),
                        'expired': bool(end and at >= end)})
        return sorted(out, key=lambda item: (item['dataset_id'], item['version']))

    def link(self, parent, child, code_sha256, permission_id, purpose):
        """Nodes are (kind, entity, version). No mutation or inferred equivalence."""
        before, after = self.get(*parent), self.get(*child)
        permission = self.get('permission', permission_id, '1')
        self.authorize(permission_id, permission['dataset_id'], permission['dataset_version'], purpose)
        root = ('dataset', permission['dataset_id'], permission['dataset_version'])
        reachable = {root} | {edge['child'] for edge in self.lineage(root)}
        if tuple(parent) not in reachable:
            raise PermissionError('Lineage parent is outside the licensed dataset graph')
        descendants = {edge['child'] for edge in self.lineage(child)}
        if tuple(parent) == tuple(child) or tuple(parent) in descendants:
            raise ValueError('Scientific lineage must be acyclic')
        if len(code_sha256) != 64 or any(c not in '0123456789abcdef' for c in code_sha256):
            raise ValueError('Transformation code SHA256 required')
        metadata = {'input_sha256': digest(before), 'output_sha256': digest(after), 'code_sha256': code_sha256,
                    'permission_id': permission_id, 'purpose': purpose, 'principal': self.principal,
                    'created': datetime.now(timezone.utc).isoformat()}
        with self.db:
            self.db.execute('INSERT INTO edges VALUES(?,?,?,?,?,?,?,?,?)',
                            (self.tenant, *parent, *child, encode(metadata), digest(metadata)))

    def lineage(self, node, forward=True):
        """Transitive traversal across persisted revisions; validates each edge and endpoint."""
        self.get(*node)
        pending, visited, result = [node], set(), []
        while pending:
            current = pending.pop()
            if current in visited:
                continue
            visited.add(current)
            columns = ('parent_kind', 'parent', 'parent_version') if forward else ('child_kind', 'child', 'child_version')
            query = 'SELECT parent_kind,parent,parent_version,child_kind,child,child_version,metadata,sha256 FROM edges WHERE tenant=? AND ' + ' AND '.join(c + '=?' for c in columns)
            for row in self.db.execute(query, (self.tenant, *current)).fetchall():
                parent, child, metadata = tuple(row[:3]), tuple(row[3:6]), json.loads(row[6])
                if digest(metadata) != row[7] or digest(self.get(*parent)) != metadata['input_sha256'] or digest(self.get(*child)) != metadata['output_sha256']:
                    raise CatalogIntegrityError('Lineage integrity failed')
                result.append({'parent': parent, 'child': child, **metadata})
                pending.append(child if forward else parent)
        return result
