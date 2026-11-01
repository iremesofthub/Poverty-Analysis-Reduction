"""Validate and idempotently load public, aggregate financial inclusion evidence."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "source-data" / "financial-inclusion"
MIGRATION = ROOT / "supabase" / "migrations" / "20261031012000_financial_inclusion_public_data.sql"


def load_env() -> dict[str, str]:
    values = dict(os.environ)
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values.setdefault(key.strip(), value.strip().strip("\"'"))
    return values


def validate() -> tuple[list[dict], list[dict]]:
    registry = json.loads((DATA / "registry.json").read_text(encoding="utf-8"))
    observations = json.loads((DATA / "normalized" / "finscope-2024-observations.json").read_text(encoding="utf-8"))
    seen = set()
    for source in registry["sources"]:
        if source["status"] not in {"Imported", "Published but not downloaded", "Access restricted", "Not available", "Validation failed", "Superseded"}:
            raise ValueError(f"Invalid source status for {source['source_id']}")
        if source["local_file"]:
            path = ROOT / source["local_file"]
            if not path.is_file():
                raise ValueError(f"Missing source file for {source['source_id']}")
            digest = hashlib.sha256(path.read_bytes()).hexdigest().upper()
            if digest != source["sha256"]:
                raise ValueError(f"SHA-256 mismatch for {source['source_id']}")
            if path.read_bytes()[:5] != b"%PDF-":
                raise ValueError(f"Unexpected file signature for {source['source_id']}")
    for row in observations:
        if row["observation_id"] in seen:
            raise ValueError(f"Duplicate observation ID: {row['observation_id']}")
        seen.add(row["observation_id"])
        if row["unit"] == "percent" and not 0 <= row["value"] <= 100:
            raise ValueError(f"Percent outside 0-100: {row['observation_id']}")
        if row["source_id"] not in {source["source_id"] for source in registry["sources"]}:
            raise ValueError(f"Unknown source: {row['source_id']}")
        date.fromisoformat(row["period_start"])
        date.fromisoformat(row["period_end"])
        if not row.get("table_reference") or not row.get("methodology"):
            raise ValueError(f"Missing provenance: {row['observation_id']}")
        if row["geography_level"] != "national" and not row.get("geography_code"):
            raise ValueError(f"Subnational observation without verified geography code: {row['observation_id']}")
    return registry["sources"], observations


def sql_json(value: object) -> str:
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if "$fi$" in raw:
        raise ValueError("Unexpected SQL quoting delimiter in source data")
    return "$fi$" + raw + "$fi$"


def management_query(query: str, *, read_only: bool = False) -> object:
    env = load_env()
    token = env.get("SUPABASE_ACCESS_TOKEN") or env.get("Personal_Token_Supabase")
    project_url = env.get("VITE_SUPABASE_URL", "")
    project_ref = re.sub(r"^https?://|\.supabase\.co/?$", "", project_url)
    if not token or not re.fullmatch(r"[a-z0-9]{20}", project_ref):
        raise RuntimeError("Supabase Management API credentials/project reference are unavailable")
    payload = json.dumps({"query": query, "read_only": read_only}).encode()
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        # Deliberately omit response body: it may contain SQL or database details.
        raise RuntimeError(f"Supabase database query failed with HTTP {exc.code}; check PAT database permission") from None


def load_sql(sources: list[dict], observations: list[dict]) -> str:
    source_json = sql_json(sources)
    observation_json = sql_json(observations)
    return f"""
begin;
insert into public.financial_inclusion_sources (
 source_id,publisher,title,source_url,period_label,publication_date,retrieval_date,license,license_url,
 local_file,sha256,content_type,byte_size,extraction_method,geography_available,status,limitation
)
select x.source_id,x.publisher,x.title,x.source_url,x.period_label,x.publication_date::date,x.retrieval_date::timestamptz,
 x.license,x.license_url,x.local_file,x.sha256,x.content_type,x.byte_size,x.extraction_method,x.geography_available,x.status,x.limitation
from jsonb_to_recordset({source_json}::jsonb) as x(
 source_id text,publisher text,title text,source_url text,period_label text,publication_date text,retrieval_date text,
 license text,license_url text,local_file text,sha256 text,content_type text,byte_size bigint,extraction_method text,
 geography_available text[],status text,limitation text
)
on conflict (source_id) do update set publisher=excluded.publisher,title=excluded.title,source_url=excluded.source_url,
 period_label=excluded.period_label,publication_date=excluded.publication_date,retrieval_date=excluded.retrieval_date,
 license=excluded.license,license_url=excluded.license_url,local_file=excluded.local_file,sha256=excluded.sha256,
 content_type=excluded.content_type,byte_size=excluded.byte_size,extraction_method=excluded.extraction_method,
 geography_available=excluded.geography_available,status=excluded.status,limitation=excluded.limitation,updated_at=now();

insert into public.financial_inclusion_observations (
 observation_id,source_id,indicator,indicator_label,value,unit,period_start,period_end,geography_level,geography_code,
 geography_name,population,denominator,provider_class,product,segment_type,segment,table_reference,methodology,quality_flags,transformation
)
select x.observation_id,x.source_id,x.indicator,x.indicator_label,x.value,x.unit,x.period_start::date,x.period_end::date,
 x.geography_level,x.geography_code,x.geography_name,x.population,x.denominator,x.provider_class,x.product,x.segment_type,
 x.segment,x.table_reference,x.methodology,x.quality_flags,coalesce(x.transformation,'Published value; no numeric transformation')
from jsonb_to_recordset({observation_json}::jsonb) as x(
 observation_id text,source_id text,indicator text,indicator_label text,value numeric,unit text,period_start text,period_end text,
 geography_level text,geography_code text,geography_name text,population text,denominator text,provider_class text,product text,
 segment_type text,segment text,table_reference text,methodology text,quality_flags text[],transformation text
)
on conflict (observation_id) do update set source_id=excluded.source_id,indicator=excluded.indicator,
 indicator_label=excluded.indicator_label,value=excluded.value,unit=excluded.unit,period_start=excluded.period_start,
 period_end=excluded.period_end,geography_level=excluded.geography_level,geography_code=excluded.geography_code,
 geography_name=excluded.geography_name,population=excluded.population,denominator=excluded.denominator,
 provider_class=excluded.provider_class,product=excluded.product,segment_type=excluded.segment_type,segment=excluded.segment,
 table_reference=excluded.table_reference,methodology=excluded.methodology,quality_flags=excluded.quality_flags,
 transformation=excluded.transformation;
commit;
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--load", action="store_true", help="apply migration and idempotently load validated aggregates into the configured Supabase database")
    parser.add_argument("--verify-db", action="store_true", help="print safe row counts and imported periods from the configured database")
    args = parser.parse_args()
    try:
        sources, observations = validate()
    except Exception as exc:
        print(f"VALIDATION_FAILED: {exc}", file=sys.stderr)
        return 2
    print(f"VALIDATION_PASSED sources={len(sources)} observations={len(observations)} individual_records=0")
    if args.load:
        management_query(MIGRATION.read_text(encoding="utf-8"))
        management_query(load_sql(sources, observations))
        print("DATABASE_LOAD_SUCCEEDED idempotent_upsert=true")
    if args.verify_db:
        result = management_query(
            "select (select count(*) from public.financial_inclusion_sources) as source_count, "
            "(select count(*) from public.financial_inclusion_observations) as observation_count, "
            "(select count(*) from public.financial_inclusion_observations where source_id='nisr-finscope-2024-report') as finscope_count, "
            "(select jsonb_build_object('observation_id',o.observation_id,'value',o.value,'unit',o.unit,'table_reference',o.table_reference,'source_file',s.local_file,'source_sha256',s.sha256) "
            " from public.financial_inclusion_observations o join public.financial_inclusion_sources s using(source_id) "
            " where o.observation_id='finscope2024-national-inclusion-derived') as lineage_sample",
            read_only=True,
        )
        print("DATABASE_VERIFY_RESULT " + json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
