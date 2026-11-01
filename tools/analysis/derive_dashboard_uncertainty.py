"""Derive design-based uncertainty for the dashboard's EICV7 district aggregates.

UPG-01. This does NOT build a new survey engine: it calls the existing primary
estimator (`engine/ireme/survey.py`) through the existing loader
(`engine/ireme/data_eicv7.py`) using the same person/household weight conventions
as `tools/analysis/derive_dashboard_evidence.py` and `engine/ireme/science.py`.

Output is AGGREGATE ONLY: one record per geography holding a point estimate,
standard error, 95% interval, design degrees of freedom, sample/PSU counts,
reliability grade and a joint district-vs-national contrast. No respondent,
household or PSU identifier is written.

Run from the project root:
    python tools/analysis/derive_dashboard_uncertainty.py

The script fails closed: it refuses to write when a point estimate no longer
reconciles with the published national headcount or with the aggregate file the
dashboard already shows, so an interval can never be attached to a number the
dashboard does not display.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import platform
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

from ireme import data_eicv7, survey  # noqa: E402

ARCHIVE = data_eicv7.zip_path()
AGGREGATES = ROOT / "src/data/dashboard-eicv7-aggregates.json"
OUTPUT = ROOT / "src/data/dashboard-eicv7-uncertainty.json"
POVERTY_FILE = "Cross_Section/CS_EICV7_poverty_file.dta"
HOUSEHOLD_FILE = "Cross_Section/CS_S01_S5_S7_Household.dta"
VUP_FILES = (
    "Cross_Section/CS_S9D1_Direct_Support.dta",
    "Cross_Section/CS_S9D2_Classic_Public_Work.dta",
    "Cross_Section/CS_S9D3_Expanded_Public_Work.dta",
    "Cross_Section/CS_S9D4_NSDS.dta",
    "Cross_Section/CS_S9D5_Financial_Services.dta",
)

PUBLISHED_NATIONAL_POVERTY = 27.4
POVERTY_LINE_LABEL = "January 2024 national poverty line (NISR pov_jan)"
EXTREME_LINE_LABEL = "Food poverty line (NISR epov_jan)"

# Publication reliability bands come from survey.reliability_grade; these are the
# domain-sufficiency floors it is called with, recorded so the UI can explain them.
MIN_DOMAIN_OBSERVATIONS = 30
MIN_DOMAIN_PSUS = 5


def code_fingerprint() -> str:
    """Hash the estimator and loader that produced these numbers, so a run is reproducible."""
    parts = []
    for relative in ("engine/ireme/survey.py", "engine/ireme/data_eicv7.py",
                     "tools/analysis/derive_dashboard_uncertainty.py"):
        parts.append(f"{relative}:{hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()}")
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


def estimate_record(geography: str, est: survey.Estimate, scale: float, unit: str, definition: str) -> dict:
    """Fold one engine Estimate into an aggregate-only record. Nothing is invented here."""
    grade = survey.reliability_grade(est, min_n=MIN_DOMAIN_OBSERVATIONS, min_psu=MIN_DOMAIN_PSUS)
    estimable = bool(np.isfinite(est.ci_low)) and bool(np.isfinite(est.ci_high)) and est.df > 0
    return {
        "geography": geography,
        "unit": unit,
        "definition": definition,
        "point": round(est.point * scale, 4),
        "se": round(est.se * scale, 4) if np.isfinite(est.se) else None,
        "df": est.df,
        "ciLow": round(est.ci_low * scale, 1) if estimable else None,
        "ciHigh": round(est.ci_high * scale, 1) if estimable else None,
        "ciMethod": est.ci_method,
        "ciEstimated": estimable,
        "sampleObservations": est.n_obs,
        "samplePsus": est.n_psu_domain,
        "designEffect": round(est.deff, 3) if est.deff is not None else None,
        "coefficientOfVariation": round(est.cv, 4) if est.cv is not None else None,
        "reliability": grade["grade"],
        "publishable": bool(grade["publishable"]),
        "reliabilityReasons": grade["reasons"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=str(OUTPUT), help="Where to write the aggregate JSON.")
    args = parser.parse_args()
    output_path = Path(args.output)

    if not ARCHIVE.exists():
        print(f"REFUSED: licensed EICV7 archive not present at {ARCHIVE}", file=sys.stderr)
        print("No interval can be derived without the source microdata.", file=sys.stderr)
        return 1

    # `load_eicv7` already merges the household strata table, which carries `strata_id`.
    with zipfile.ZipFile(ARCHIVE) as archive:
        frame, dataset_sha = data_eicv7.load_eicv7()
        participants: set[object] = set()
        for filename in VUP_FILES:
            module = pd.read_stata(io.BytesIO(archive.read(filename)), columns=["hhid", "s9d1q1"],
                                   convert_categoricals=True)
            participants.update(module.loc[module.s9d1q1 == "Yes", "hhid"])

    if not frame.hhid.is_unique or frame[["hhid", "clust", "pov_jan", "district"]].isna().any().any():
        print("REFUSED: missing design fields or duplicate household identifiers", file=sys.stderr)
        return 1
    if frame["strata_id"].isna().any():
        print("REFUSED: missing strata identifiers", file=sys.stderr)
        return 1

    frame["district"] = frame["district"].astype(str)
    frame["vup_participant"] = frame.hhid.isin(participants)
    if frame.district.nunique() != 30:
        print(f"REFUSED: expected 30 district domains, found {frame.district.nunique()}", file=sys.stderr)
        return 1

    # Person universe (poverty) and household universe (VUP) stay separate designs.
    person = data_eicv7.person_design(frame)
    household = survey.Design(frame["weight"].to_numpy(float), frame["strata_id"].to_numpy(),
                              frame["clust"].to_numpy(), unit="household")

    poor = (frame.pov_jan.astype(str) == "Poor").to_numpy(float)
    extreme = (frame.epov_jan.astype(str) == "Extreme Poor").to_numpy(float)
    vup = frame.vup_participant.to_numpy(float)
    poor_domain = poor.astype(bool)
    national = np.ones(len(frame), bool)

    geographies = ["Rwanda", *sorted(frame.district.unique())]
    poverty_rows, extreme_rows, vup_rows, contrast_rows, vup_contrast_rows = [], [], [], [], []
    for geography in geographies:
        in_domain = national if geography == "Rwanda" else (frame.district == geography).to_numpy()

        poverty_est = survey.ratio_estimate(person, poor, domain=in_domain, expected_unit="person")
        poverty_rows.append(estimate_record(geography, poverty_est, 100.0, "percent_of_people", POVERTY_LINE_LABEL))

        extreme_est = survey.ratio_estimate(person, extreme, domain=in_domain, expected_unit="person")
        extreme_rows.append(estimate_record(geography, extreme_est, 100.0, "percent_of_people", EXTREME_LINE_LABEL))

        if not (in_domain & poor_domain).any():
            vup_rows.append({"geography": geography, "unit": "percent_of_surveyed_poor_households",
                             "definition": "reported VUP participation in any S9D module",
                             "point": None, "ciEstimated": False, "reliability": "unestimable",
                             "publishable": False, "reliabilityReasons": ["no surveyed poor households in domain"]})
        else:
            vup_est = survey.proportion_estimate(household, vup, domain=in_domain & poor_domain, ci="logit",
                                                 expected_unit="household")
            vup_rows.append(estimate_record(geography, vup_est, 100.0,
                                            "percent_of_surveyed_poor_households",
                                            "reported VUP participation in any S9D module"))

        if geography == "Rwanda":
            continue

        # Joint variance: a district and the nation overlap, so the difference uses the
        # design covariance rather than independent-sample error propagation.
        poverty_contrast = survey.difference_estimate(person, poor, None, in_domain, national)
        contrast_rows.append({
            "geography": geography, "comparator": "Rwanda", "unit": "percentage_points",
            "difference": round(poverty_contrast.point * 100, 4),
            "se": round(poverty_contrast.se * 100, 4),
            "df": poverty_contrast.df,
            "ciLow": round(poverty_contrast.ci_low * 100, 1) if np.isfinite(poverty_contrast.ci_low) else None,
            "ciHigh": round(poverty_contrast.ci_high * 100, 1) if np.isfinite(poverty_contrast.ci_high) else None,
            "ciMethod": poverty_contrast.ci_method,
            "distinguishable": bool(np.isfinite(poverty_contrast.ci_low)
                                    and (poverty_contrast.ci_low > 0 or poverty_contrast.ci_high < 0)),
        })
        if (in_domain & poor_domain).any() and poor_domain.any():
            vup_contrast = survey.difference_estimate(household, vup, None, in_domain & poor_domain, poor_domain)
            vup_contrast_rows.append({
                "geography": geography, "comparator": "Rwanda (poor households)", "unit": "percentage_points",
                "difference": round(vup_contrast.point * 100, 4),
                "se": round(vup_contrast.se * 100, 4),
                "df": vup_contrast.df,
                "ciLow": round(vup_contrast.ci_low * 100, 1) if np.isfinite(vup_contrast.ci_low) else None,
                "ciHigh": round(vup_contrast.ci_high * 100, 1) if np.isfinite(vup_contrast.ci_high) else None,
                "ciMethod": vup_contrast.ci_method,
                "distinguishable": bool(np.isfinite(vup_contrast.ci_low)
                                        and (vup_contrast.ci_low > 0 or vup_contrast.ci_high < 0)),
            })

    national_poverty = next(row for row in poverty_rows if row["geography"] == "Rwanda")
    if round(national_poverty["point"], 1) != PUBLISHED_NATIONAL_POVERTY:
        print(f"REFUSED: national headcount {national_poverty['point']} no longer reconciles with the "
              f"published {PUBLISHED_NATIONAL_POVERTY}", file=sys.stderr)
        return 1

    # Cross-check every point against the file the dashboard already renders. An interval
    # is only ever attached to the number a judge can actually see.
    if not AGGREGATES.exists():
        print(f"REFUSED: {AGGREGATES} is missing, cannot cross-check displayed points", file=sys.stderr)
        return 1
    published = json.loads(AGGREGATES.read_text(encoding="utf-8"))
    displayed = {row["name"]: row for row in published["districts"]}
    displayed["Rwanda"] = published["national"]
    mismatches = []
    for row in poverty_rows:
        shown = displayed.get(row["geography"], {}).get("poverty")
        if shown is None or abs(round(row["point"], 1) - shown) > 0.05:
            mismatches.append((row["geography"], row["point"], shown))
    if mismatches:
        print("REFUSED: derived points differ from the published dashboard values:", file=sys.stderr)
        for geography, derived, shown in mismatches:
            print(f"  {geography}: derived {derived} vs displayed {shown}", file=sys.stderr)
        return 1

    result = {
        "provenance": {
            "source": "NISR EICV7 2023/24 cross-section (licensed microdata, aggregate output only)",
            "survey": "EICV7",
            "period": "2023/24",
            "indicatorId": "eicv7.poverty_headcount.jan2024",
            "extremeIndicatorId": "eicv7.extreme_poverty_headcount.food_line",
            "vupIndicatorId": "eicv7.vup_participation_surveyed_poor_households",
            "datasetSha256": dataset_sha,
            # The licensed archive's internal member paths are deliberately NOT shipped to
            # the browser bundle: this dashboard is published, and naming files inside a
            # licensed dataset is a data-agreement detail rather than something a reader of
            # aggregates needs. `deriveFiles` records the inputs in the local build log only.
            "derivedFrom": "Household cross-section poverty, strata and VUP module files (paths held in the local build, not published)",
            "codeFingerprint": code_fingerprint(),
            "derivedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "environment": {"python": platform.python_version(), "numpy": np.__version__,
                            "pandas": pd.__version__},
        },
        "method": {
            "estimator": "engine/ireme/survey.py Taylor-series linearisation under stratified "
                         "multistage cluster design (strata_id, clust)",
            "povertyUniverse": "Person universe: weights are pop_wt, the estimate is the share of "
                               "people in poor households. Denominator is the weighted person population.",
            "vupUniverse": "Household universe: weights are the household weight, restricted to surveyed "
                           "poor households. Denominator is weighted poor households, NOT people.",
            "intervalMethod": {"poverty": "Student t on design degrees of freedom",
                               "vup": "Korn-Graubard style logit interval on design degrees of freedom"},
            "degreesOfFreedom": "n_PSU - n_strata for the full design, the standard subdomain approach; "
                                "domain sample and PSU counts are reported per geography.",
            "contrast": "District versus national difference uses the joint design covariance "
                        "(survey.difference_estimate), not interval overlap.",
            "reliability": f"survey.reliability_grade with minimum {MIN_DOMAIN_OBSERVATIONS} observations "
                           f"and {MIN_DOMAIN_PSUS} PSUs per domain; bands CV<15% high, <30% moderate, "
                           "otherwise low.",
            "notIncluded": "Rank separation is not computed: ordering districts by point estimate does "
                           "not establish real rank differences without a resampled rank distribution.",
        },
        "status": {
            "evidenceState": "CALCULATED_ESTIMATE_PENDING_SCIENTIFIC_REVIEW",
            "certified": False,
            "note": "Computed by the repository's primary estimator from licensed EICV7 microdata. "
                    "Independent scientific review of method, tolerances and publication decision is "
                    "outstanding; these intervals are not an NISR-certified publication.",
        },
        "reliabilityBands": {"high": "CV below 15%", "moderate": "CV below 30%", "low": "CV 30% or above",
                             "unreliable": "Domain below the minimum observations or PSUs",
                             "unestimable": "Variance not estimable for this domain"},
        "national": national_poverty,
        "poverty": [row for row in poverty_rows if row["geography"] != "Rwanda"],
        "extremePoverty": [row for row in extreme_rows if row["geography"] != "Rwanda"],
        "vupAmongPoor": [row for row in vup_rows if row["geography"] != "Rwanda"],
        "contrasts": contrast_rows,
        "vupContrasts": vup_contrast_rows,
    }

    output_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    estimable = sum(1 for row in result["poverty"] if row["ciEstimated"])
    publishable = sum(1 for row in result["poverty"] if row["publishable"])
    print(f"Wrote {output_path}")
    print(f"  inputs (local build log only, not published): {[POVERTY_FILE, HOUSEHOLD_FILE, *VUP_FILES]}")
    print(f"  national poverty {national_poverty['point']}% "
          f"[{national_poverty['ciLow']}, {national_poverty['ciHigh']}] df {national_poverty['df']}")
    print(f"  districts with an estimable interval: {estimable}/30; publication-reliable: {publishable}/30")
    print(f"  district-vs-national contrasts: {len(contrast_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
