"""Create aggregate-only dashboard data from the user's EICV7 cross-section.

Run from the project root with: python tools/analysis/derive_dashboard_evidence.py
No respondent or household identifiers are written to the output.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = next(ROOT.glob("Data/**/*EICV7 2023-2024.zip"))
OUTPUT = ROOT / "src/data/dashboard-eicv7-aggregates.json"
POVERTY_FILE = "Cross_Section/CS_EICV7_poverty_file.dta"
VUP_FILES = (
    "Cross_Section/CS_S9D1_Direct_Support.dta",
    "Cross_Section/CS_S9D2_Classic_Public_Work.dta",
    "Cross_Section/CS_S9D3_Expanded_Public_Work.dta",
    "Cross_Section/CS_S9D4_NSDS.dta",
    "Cross_Section/CS_S9D5_Financial_Services.dta",
)


def weighted_share(data: pd.DataFrame, test: pd.Series, weight: str) -> float:
    return float(100 * data.loc[test, weight].sum() / data[weight].sum())


with zipfile.ZipFile(ARCHIVE) as archive:
    households = pd.read_stata(
        io.BytesIO(archive.read(POVERTY_FILE)),
        columns=["hhid", "province", "district", "weight", "pop_wt", "pov_jan", "epov_jan"],
        convert_categoricals=True,
    )
    if len(households) != 15054 or households.hhid.nunique() != len(households):
        raise ValueError("Unexpected EICV7 household count or duplicate household identifiers")

    participating_households: set[object] = set()
    for filename in VUP_FILES:
        module = pd.read_stata(
            io.BytesIO(archive.read(filename)),
            columns=["hhid", "s9d1q1"],
            convert_categoricals=True,
        )
        participating_households.update(module.loc[module.s9d1q1 == "Yes", "hhid"])

households["vup_participant"] = households.hhid.isin(participating_households)
is_poor = households.pov_jan == "Poor"
is_extreme = households.epov_jan == "Extreme Poor"
poor_households = households.loc[is_poor]

districts = []
for name, group in households.groupby("district", observed=True):
    poor_group = group.loc[group.pov_jan == "Poor"]
    districts.append(
        {
            "name": str(name),
            "poverty": round(weighted_share(group, group.pov_jan == "Poor", "pop_wt"), 1),
            "extremePoverty": round(
                weighted_share(group, group.epov_jan == "Extreme Poor", "pop_wt"), 1
            ),
            "vupAmongPoor": round(
                weighted_share(poor_group, poor_group.vup_participant, "weight"), 1
            ),
            "sampleHouseholds": len(group),
            "samplePoorHouseholds": len(poor_group),
        }
    )

result = {
    "method": {
        "survey": "NISR EICV7 cross-section, 2023/24",
        "poverty": "Population-weighted share below the January 2024 poverty line (pov_jan == Poor).",
        "extremePoverty": "Population-weighted share below the food poverty line (epov_jan == Extreme Poor).",
        "vupAmongPoor": "Household-weighted share of surveyed poor households with a member answering Yes to VUP participation in any of the five S9D modules. This measures reported participation, not receipt of a payment in the past 12 months or eligibility for all programmes.",
        "vupAmongAllHouseholds": "Household-weighted share of all surveyed households with a member answering Yes to VUP participation in any of the five S9D modules (same definition as vupAmongPoor, all households).",
        "uncertainty": "District sample counts are shown here. Design-based 95% confidence intervals, standard errors, reliability grades and joint district-versus-Rwanda contrasts are derived separately by derive_dashboard_uncertainty.py from the same EICV7 microdata; they are pending independent scientific review.",
    },
    "national": {
        "poverty": round(weighted_share(households, is_poor, "pop_wt"), 1),
        "extremePoverty": round(weighted_share(households, is_extreme, "pop_wt"), 1),
        "vupAmongPoor": round(
            weighted_share(poor_households, poor_households.vup_participant, "weight"), 1
        ),
        "vupAmongAllHouseholds": round(weighted_share(households, households.vup_participant, "weight"), 1),
        "sampleHouseholds": len(households),
        "samplePoorHouseholds": len(poor_households),
    },
    "districts": sorted(districts, key=lambda item: item["name"]),
}

if len(result["districts"]) != 30 or result["national"]["poverty"] != 27.4:
    raise ValueError("Derived values do not reconcile with published EICV7 national poverty")

OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {OUTPUT} with {len(result['districts'])} district aggregates")
print("National:", result["national"])
