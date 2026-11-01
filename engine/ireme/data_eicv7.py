"""Loader for the licensed EICV7 2023/24 poverty file (real microdata; never leaves the machine)."""
from __future__ import annotations

import hashlib
import io
import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from . import survey as sv

DATA_DIR = Path(__file__).resolve().parents[2] / "Data" / "Track 2 - Financial Inclusion and Poverty Reduction"
ZIP_NAME = "T2 Finance and Poverty - Household Living Conditions Survey EICV7 2023-2024.zip"
POVERTY = "Cross_Section/CS_EICV7_poverty_file.dta"
HOUSEHOLD = "Cross_Section/CS_S01_S5_S7_Household.dta"


def zip_path() -> Path:
    return DATA_DIR / ZIP_NAME


def available() -> bool:
    return zip_path().exists()


def _clean_serializable(obj):
    """Recursively convert numpy scalars (dict keys included) to builtin JSON types."""
    if isinstance(obj, np.generic):
        return obj.item()
    if isinstance(obj, dict):
        return {_clean_serializable(key): _clean_serializable(value) for key, value in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean_serializable(value) for value in obj]
    return obj


def dictionary_fingerprint(archive: Path | None = None) -> str:
    """Hash only embedded variable/value labels for the calculation's two source tables."""
    p = Path(archive) if archive is not None else zip_path()
    dictionary = {}
    with zipfile.ZipFile(p) as source:
        for member in (POVERTY, HOUSEHOLD):
            reader = pd.read_stata(io.BytesIO(source.read(member)), iterator=True, convert_categoricals=False)
            with reader:
                dictionary[member] = {'variable_labels': reader.variable_labels(),
                                      'value_labels': reader.value_labels()}
    encoded = json.dumps(_clean_serializable(dictionary), sort_keys=True, separators=(',', ':'), default=str,
                         ensure_ascii=False)
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


def load_eicv7(archive: Path | None = None) -> tuple[pd.DataFrame, str]:
    """Returns (household-level frame with design fields, sha256 of the source archive)."""
    p = Path(archive) if archive is not None else zip_path()
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    with zipfile.ZipFile(p) as z:
        pov = pd.read_stata(io.BytesIO(z.read(POVERTY)), convert_categoricals=True)
        hh = pd.read_stata(io.BytesIO(z.read(HOUSEHOLD)), columns=["hhid", "strata_id"], convert_categoricals=False)
    frame = pov.merge(hh, on="hhid", validate="one_to_one")
    frame["district"] = frame["district"].astype(str)
    if hashlib.sha256(p.read_bytes()).hexdigest() != digest:
        raise ValueError('Survey archive changed while loading')
    return frame, digest


def load_governed(catalog, dataset_id: str, dataset_version: str, permission_id: str,
                  purpose: str, archive: Path | None = None):
    """Authorize an immutable dataset revision before parsing any microdata.

    Existing exploratory callers use load_eicv7; production fact creation must use
    this boundary plus definition and scientific review. No legal rights are inferred
    from a file being present on disk.
    """
    approved = catalog.authorize(permission_id, dataset_id, dataset_version, purpose)
    path = Path(archive) if archive is not None else zip_path()
    if hashlib.sha256(path.read_bytes()).hexdigest() != approved['sha256']:
        raise ValueError('Raw archive does not match the permitted dataset revision')
    frame, sha = load_eicv7(path)
    if sha != approved['sha256']:
        raise ValueError('Dataset revision changed before parsing')
    frame.attrs['governance'] = {'dataset_id': dataset_id, 'dataset_version': dataset_version,
                               'dataset_sha256': sha, 'permission_id': permission_id, 'purpose': purpose,
                               'sensitivity': approved['sensitivity']}
    return frame, sha


def person_design(frame: pd.DataFrame, singleton: str = "error") -> sv.Design:
    """Person-weighted design (pop_wt = household weight x members)."""
    return sv.Design(frame["pop_wt"].to_numpy(float), frame["strata_id"].to_numpy(),
                     frame["clust"].to_numpy(), unit="person", singleton=singleton)


def poor_indicator(frame: pd.DataFrame) -> np.ndarray:
    return (frame["pov_jan"].astype(str) == "Poor").to_numpy(float)
