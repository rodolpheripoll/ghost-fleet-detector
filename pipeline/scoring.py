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
#  Speed Anomaly (0.20) — physically impossible speed proves deliberate
#    data manipulation of the AIS transponder.
#
#  Position Jump (0.15) — fake GPS coordinates; lower weight than speed
#    because it could, in rare cases, be a legitimate sensor glitch.
#
#  Critical Zone (0.10) — contextual risk factor based on geographic
#    location rather than observed vessel behaviour; lowest individual weight.

WEIGHTS = {
    "AIS Disabled":  0.30,
    "MMSI Spoofing": 0.25,
    "Speed Anomaly": 0.20,
    "Fake Position": 0.15,
    "Zone Crossing": 0.10,
    # ML-detected anomalies contribute via their confidence score
    "ML Anomaly":    0.12,
    "Course Anomaly": 0.08,
}

# Risk-level thresholds
# Suspicious score threshold = 0.6 → combination of at least 2 simultaneous
# suspicious behaviours (e.g. AIS Off + Speed Anomaly = 0.50 alone; with
# position jump = 0.65, crossing the Critical boundary).
def _risk_label(score: float) -> str:
    if score >= 0.8:
        return "Ghost Fleet"
    if score >= 0.6:
        return "Critical"
    if score >= 0.3:
        return "Suspect"
    return "Normal"


def compute_scores(
    ais_df: pd.DataFrame,
    anomalies_df: pd.DataFrame,
    zones_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Compute a composite suspicion score [0, 1] per ship.

    Algorithm
    ---------
    For each MMSI we collect all flagged anomaly types, look up their weight,
    apply the confidence as a multiplier, sum the weighted contributions, and
    clip to [0, 1].  The score formula is:

        score = clip(sum(weight_i * confidence_i  for anomaly_i of ship), 0, 1)

    This means a ship must accumulate multiple anomalies to cross the 0.6
    "Critical" threshold, preventing false positives from single-event noise.

    Returns
    -------
    ais_df enriched with columns: score, risk_level
    (one row per AIS position; the score is replicated from the per-ship value)
    """
    print("[scoring] Computing per-ship suspicion scores...")

    if anomalies_df.empty:
        scored = ais_df.copy()
        scored["score"]     = 0.0
        scored["risk_level"] = "Normal"
        return scored

    # ── Per-MMSI score ────────────────────────────────────────────────────────
    ship_scores: dict[str, float] = {}

    for mmsi_val, group in anomalies_df.groupby("mmsi"):
        total = 0.0
        for _, row in group.iterrows():
            weight     = WEIGHTS.get(row["type"], 0.05)
            confidence = float(row.get("confidence", 0.5))
            total     += weight * confidence
        ship_scores[str(mmsi_val)] = float(np.clip(total, 0.0, 1.0))

    # ── Annotate AIS DataFrame ────────────────────────────────────────────────
    scored = ais_df.copy()
    scored["mmsi"]      = scored["mmsi"].astype(str)
    scored["score"]     = scored["mmsi"].map(ship_scores).fillna(0.0)
    scored["risk_level"] = scored["score"].apply(_risk_label)

    # ── Summary ───────────────────────────────────────────────────────────────
    level_counts = scored.drop_duplicates("mmsi")["risk_level"].value_counts()
    print(f"[scoring] Risk distribution (unique ships):")
    for level, cnt in level_counts.items():
        print(f"  {level:<15}: {cnt}")

    return scored
