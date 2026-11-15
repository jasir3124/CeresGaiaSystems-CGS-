# Three-crop rotation planner

The recommendations API computes a rotation plan from the same downloaded climate data and saved field inputs as individual crop suitability. No additional NASA or AI requests are made. The section is displayed before the suitability groups and is included in the saved recommendation report.

## Inputs and stored data

The last three non-future plantings are selected newest first; undated migrated records are retained after dated records, with an explicit uncertainty note. Each crop has stored N/P/K demand classes, crop family, temperature/pH/cycle references, water needs, salinity threshold, and qualitative secondary/micronutrient priorities. These are screening profiles, not measured chemical contents or nutrient exports.

The newest eligible lab sample supplies pH, saturated-paste ECe, organic matter, and optional N/P/K/Ca/Mg/S/Fe/Zn/B values with mg/kg units and laboratory interpretation. Samples over three years old are excluded. Unknown nutrient categories are excluded even when a concentration is present. All nine interpreted nutrients participate in the chemistry screen; organic matter is displayed as context only, with no universal fertility target.

## Search and scores

Search ordered sequences of three distinct crops. Adjacent crops must change family, including the transition from the latest recorded crop. At each prefix, reuse the pure crop suitability engine with the projected preceding-three history and earliest next slot. It uses actual historical monthly temperatures, rain, trends, frost/heat, pH and ECe. The first step respects the selected target month; subsequent steps use candidate temperature windows. Skip candidates with climate <30, usable soil <20, or seasonal/extremes <20. These are CGS screening cutoffs. Do not force a third step if constraints cannot be met.

Planning assumes the field becomes available after the latest planting's upper reference cycle duration, or today if later. Each proposed crop occupies its upper reference cycle duration, and the next crop begins at a subsequent matching month. This is a broad calendar assumption: actual harvest, cultivar and local sowing windows must be confirmed. It is not an optimal calendar search across every planting date.

Step scoring uses:
- Seasonal and soil fit: 50%, computed from the existing climate/adaptation/soil/water/season factors, with partial evidence weighting.
- Family-break screening: 25%. Same-crop and shared-family pressure from the preceding three entries receives recency weights 1, 0.65, 0.35. Solanaceae inside three years or with unknown dates receive an additional conservative penalty. These rules are not disease-specific interval guarantees.
- Lab chemistry: up to 25%, multiplied by evidence coverage. N/P/K have weight 3 each; secondary/micronutrients highlighted in the crop profile weight 2, others weight 1. The qualitative category policy is explicit in the code. Low measured N/P/K plus repeated high-demand profiles receives an additional capped screening penalty, without subtracting invented nutrient amounts from the lab sample.

Compare complete sequences using step weights 1, 0.9, 0.8. Show the strongest sequence and up to two alternatives. Missing information lowers evidence coverage; confidence is never above Moderate. When future planting dates make the existing lab sample too old, exclude chemistry for those steps. The measured chemistry is never changed to simulate consumption or nitrogen fixation. Future amendments, yields, exports, residues and soil processes are unknown; retesting is needed before later plantings.

## Reference basis and limits

Rotation rationale: https://www.vegetables.cornell.edu/pest-management/disease-factsheets/do-rotations-matter-within-disease-management-programs/

Interpretation of measured chemistry: https://extension.missouri.edu/publications/g9077

Additional source links for crop water, salinity, ET and nutrient management are stored in the crop profiles and API report. Numerical scoring weights, recency penalties and cutoffs are CGS prototype policy, not a calibrated nutrient-balance or yield-prediction model. A high reported micronutrient category does not by itself establish toxicity; the UI calls for crop-specific interpretation and does not prescribe application rates.
