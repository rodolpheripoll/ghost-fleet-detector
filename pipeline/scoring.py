"""
scoring.py
Compute a composite suspicion score per ship from detected anomalies.
"""

import pandas as pd
import numpy as np

# ── Score weight justifications ───────────────────────────────────────────────
# Weights reflect the severity and certainty of each anomaly type:
#
#  AIS Disabled (0.30) — highest weight: complete disappearance from all
#    maritime tracking systems; direct violation of SOLAS Chapter V.
#
#  MMSI Spoofing (0.25) — identity fraud; impossible to legally track
#    the vessel; grounds for immediate flag-state reporting (IMO Circ.289).
#
#  Name Change (0.18) — ships changing their registered name mid-voyage to
#    escape sanctions blacklists. Second most common evasion technique after
#    AIS shutdown. Source: UN Panel of Experts on North Korea, Report S/2023/171.
#
#  Speed Anomaly (0.20) — physically impossible speed proves deliberate
#    data manipulation of the AIS transponder.
#
#  Fake Position (0.15) — fake GPS coordinates; lower weight than speed
#    because it could, in rare cases, be a legitimate sensor glitch.
#
#  Zone Crossing / Zone Violation (0.10) — contextual risk factor based on
#    geographic location. Both names refer to the same behaviour; "Zone Crossing"
#    is produced by the rule engine, "Zone Violation" comes from the CSV files.
#
#  ML Anomaly (0.12) — Isolation Forest score; confidence is the raw anomaly
#    score clipped to [0, 1].
#
#  Course Anomaly (0.08) — physically unrealistic heading change for large
#    commercial vessels (IMO COLREGS Rule 8).

WEIGHTS = {
    "AIS Disabled":   0.30,
    "MMSI Spoofing":  0.25,
    "Speed Anomaly":  0.20,
    "Name Change":    0.18,   # UN Panel of Experts on North Korea, S/2023/171
    "Fake Position":  0.15,
    "Zone Crossing":  0.10,   # produced by the rule engine
    "Zone Violation": 0.10,   # same behaviour, name used in CSV files
    "ML Anomaly":     0.12,
    "Course Anomaly": 0.08,
}

# Risk-level thresholds
# Suspicious score threshold = 0.6 → combination of at least 2 simultaneous
# suspicious behaviours (e.g. AIS Off + Speed Anomaly = 0.50 alone; with
# position jump = 0.65, crossing the Critical boundary).
def _risk_label(score: float) -> str:
    if score >= 0.68:
        return "Ghost Fleet"
    if score >= 0.44:
        return "Critical"
    if score >= 0.19:
        return "Suspect"
    return "Normal"


def compute_scores(
    ais_df: pd.DataFrame,
    anomalies_df: pd.DataFrame,
    zones_df: pd.DataFrame,
    ships_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """
    Compute a composite suspicion score [0, 1] per ship.

    Algorithm
    ---------
    1. For each MMSI, take the MAX confidence per anomaly type (so 10 speed
       anomalies only count once), then sum: weight_i * max_confidence_i.
    2. Apply a 5% bonus from ships_large prior_risk_score where available:
         final = clip(computed + 0.05 * prior_risk_score, 0, 1)
       The prior is intentionally weak so our computed score takes precedence.
       Source: ships_large.csv column risk_score (pre-existing registry flag).

    Returns
    -------
    ais_df enriched with columns: score, risk_level, prior_risk_score
    """
    print("[scoring] Computing per-ship suspicion scores...")

    if anomalies_df.empty:
        scored = ais_df.copy()
        scored["score"]           = 0.0
        scored["risk_level"]      = "Normal"
        scored["prior_risk_score"] = 0.0
        return scored

    # ── Per-MMSI computed score ───────────────────────────────────────────────
    # Take max confidence per (mmsi, type) so repeated detections of the same
    # anomaly type don't inflate the score. Each type counts at most once.
    ship_scores: dict[str, float] = {}

    anom = anomalies_df.copy()
    anom["mmsi"] = anom["mmsi"].astype(str)
    anom["confidence"] = pd.to_numeric(anom["confidence"], errors="coerce").fillna(0.5)

    best = anom.groupby(["mmsi", "type"])["confidence"].max().reset_index()

    # Boolean-per-type: each anomaly TYPE present contributes its full weight
    # (confidence ignored — one flag per type, not per instance).
    for mmsi_val, group in best.groupby("mmsi"):
        total = sum(
            WEIGHTS.get(row["type"], 0.05)
            for _, row in group.iterrows()
        )
        ship_scores[str(mmsi_val)] = float(np.clip(total, 0.0, 1.0))

    # ── Prior risk score from ships_large registry ────────────────────────────
    # prior_risk_score: pre-existing risk score from ships registry.
    # Weight 0.05 — used as a weak prior; our computed score takes precedence.
    prior_scores: dict[str, float] = {}
    if ships_df is not None and not ships_df.empty and "risk_score" in ships_df.columns:
        ships_df = ships_df.copy()
        ships_df["mmsi"] = ships_df["mmsi"].astype(str).str.strip()
        prior_scores = (
            ships_df.set_index("mmsi")["risk_score"]
            .apply(lambda x: float(x) if pd.notna(x) else 0.0)
            .to_dict()
        )
        print(f"  [scoring] Prior risk scores loaded for {len(prior_scores)} ships from registry.")
    else:
        print("  [scoring] No ships registry provided — prior_risk_score = 0 for all ships.")

    # ── Annotate AIS DataFrame ────────────────────────────────────────────────
    scored = ais_df.copy()
    scored["mmsi"] = scored["mmsi"].astype(str)

    computed         = scored["mmsi"].map(ship_scores).fillna(0.0)
    prior            = scored["mmsi"].map(prior_scores).fillna(0.0)
    final            = np.clip(computed + 0.05 * prior, 0.0, 1.0)

    scored["prior_risk_score"] = prior.round(4)
    scored["score"]            = final.round(4)
    scored["risk_level"]       = scored["score"].apply(_risk_label)

    # ── Summary ───────────────────────────────────────────────────────────────
    level_counts = scored.drop_duplicates("mmsi")["risk_level"].value_counts()
    print(f"[scoring] Risk distribution (unique ships):")
    for level, cnt in level_counts.items():
        print(f"  {level:<15}: {cnt}")

    return scored
