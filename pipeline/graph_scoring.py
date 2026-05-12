"""
graph_scoring.py
Graph-theory-based suspicion scoring for maritime traffic.

4 dimensions:
  isolation  (0.25) — ghost ships travel alone; percentile rank of degree
  behavior   (0.40) — AIS/MMSI/speed violations (boolean per type, not per instance)
  route_sim  (0.20) — Jaccard similarity with CONFIRMED suspicious ships only
  zone       (0.15) — presence in a sanctioned geographic zone

Fix log:
  v2 — Fix 1: isolation uses percentile rank (p20→1.0, p80→0.0) to avoid
       sparse-dataset inflation where 90%+ of ships naturally have degree 0.
  v2 — Fix 2: route_sim only uses confirmed suspicious ships (registry
       is_suspicious=True AND risk_score>0.5, OR double-confirmed in behaviors+alerts).
       Min Jaccard threshold 0.4 to filter weak corridor overlap noise.
  v2 — Fix 3: hard constraint — behavior_score=0 caps score at 0.55 (Suspect).
  v2 — Fix 4: weights recalibrated (isolation 0.35→0.25, behavior 0.25→0.40).
  v2 — Fix 5: distribution check with warning if Critical+GF > 15%.
"""

import networkx as nx
import pandas as pd
import numpy as np
from math import radians, sin, cos, sqrt, atan2

# ── Constants ─────────────────────────────────────────────────────────────────

PROXIMITY_KM = 20 * 1.852   # 20 nautical miles in km
GRID_DEGREES = 3             # 3°×3° grid cells for route fingerprinting

# Fix 4 — recalibrated weights
WEIGHTS = {
    "isolation": 0.25,   # reduced — sparse dataset inflates raw degree signal
    "behavior":  0.40,   # increased — most reliable signal
    "route_sim": 0.20,   # reduced — only confirmed-suspicious baseline
    "zone":      0.15,   # unchanged
}

BEHAVIOR_WEIGHTS = {
    "AIS Disabled":   0.40,
    "MMSI Spoofing":  0.35,
    "Name Change":    0.30,
    "Speed Anomaly":  0.25,
    "Fake Position":  0.20,
    "Zone Violation": 0.15,
    "Zone Crossing":  0.15,
    "Course Anomaly": 0.10,
    "ML Anomaly":     0.10,
}

RISK_MAP_ZONE = {"Critical": 1.0, "High": 0.5, "Medium": 0.2, "Low": 0.0}

# Fix 2 — minimum Jaccard similarity to count as "same route"
ROUTE_SIM_THRESHOLD = 0.4


# ── Helpers ───────────────────────────────────────────────────────────────────

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * R * atan2(sqrt(a), sqrt(1 - a))


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


# ── Graph construction ────────────────────────────────────────────────────────

def build_proximity_graph(ais_df: pd.DataFrame):
    """
    Undirected graph: nodes = ships (last known position),
    edges = pairs within PROXIMITY_KM.
    """
    G = nx.Graph()
    last_pos = (
        ais_df.sort_values("timestamp")
              .groupby("mmsi").last()
              .reset_index()
              .dropna(subset=["latitude", "longitude"])
    )
    for _, row in last_pos.iterrows():
        G.add_node(str(row["mmsi"]),
                   lat=row["latitude"],
                   lon=row["longitude"],
                   speed=float(row.get("speed") or 0))

    nodes = list(G.nodes(data=True))
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            mmsi_a, da = nodes[i]
            mmsi_b, db = nodes[j]
            dist = haversine_km(da["lat"], da["lon"], db["lat"], db["lon"])
            if dist <= PROXIMITY_KM:
                G.add_edge(mmsi_a, mmsi_b,
                           distance_km=round(dist, 2),
                           distance_nm=round(dist / 1.852, 2))
    return G, last_pos


# ── Scoring dimensions ────────────────────────────────────────────────────────

def compute_isolation_scores(G: nx.Graph, all_mmsi: list) -> dict:
    """
    Fix 1 — Percentile-based isolation.

    Rank each ship's degree within the dataset distribution:
      - Bottom 20th percentile (p20) → isolation 1.0  (truly isolated)
      - Top 80th percentile  (p80) → isolation 0.0  (well-connected lane)
      - Linear interpolation between p20 and p80.

    This avoids the sparse-dataset inflation where 90%+ of ships globally
    have degree 0 and would all score isolation=1.0 under the old formula.
    """
    degrees = {str(mmsi): G.degree(str(mmsi)) if str(mmsi) in G else 0
               for mmsi in all_mmsi}

    degree_values = list(degrees.values())
    p20 = float(np.percentile(degree_values, 20))
    p80 = float(np.percentile(degree_values, 80))

    scores = {}
    for mmsi, deg in degrees.items():
        if p80 == p20:
            scores[mmsi] = 0.5
        else:
            raw = 1.0 - (deg - p20) / (p80 - p20)
            scores[mmsi] = round(float(np.clip(raw, 0.0, 1.0)), 4)
    return scores


def compute_route_fingerprints(ais_df: pd.DataFrame) -> dict:
    """Route fingerprint = set of 3°×3° grid cells visited."""
    df = ais_df.copy()
    df["mmsi"] = df["mmsi"].astype(str)
    df["cell"] = (
        (df["latitude"]  / GRID_DEGREES).astype(int) * 10000 +
        (df["longitude"] / GRID_DEGREES).astype(int)
    )
    return df.groupby("mmsi")["cell"].apply(set).to_dict()


def compute_route_similarity_scores(
    fingerprints: dict,
    anomalies_df,
    alerts_df,
    behaviors_df,
    ships_df,
) -> dict:
    """
    Fix 2 — Route similarity against CONFIRMED suspicious ships only.

    Confirmed = (registry is_suspicious=True AND risk_score > 0.5)
             OR (present in BOTH behaviors AND alerts — double-confirmed).

    Similarity is zeroed if Jaccard < ROUTE_SIM_THRESHOLD (0.4) to filter
    corridor overlap noise between ships in the same ocean.
    """
    # From ships registry
    confirmed_from_registry = set()
    if ships_df is not None and not ships_df.empty and "is_suspicious" in ships_df.columns:
        mask = (
            (ships_df["is_suspicious"].astype(str).str.lower().isin(["true", "1"])) &
            (pd.to_numeric(ships_df["risk_score"], errors="coerce").fillna(0) > 0.5)
        )
        confirmed_from_registry = set(ships_df.loc[mask, "mmsi"].astype(str).tolist())

    # Double-confirmed: in BOTH behaviors AND alerts
    beh_mmsi   = set(behaviors_df["mmsi"].astype(str).tolist()) if (behaviors_df is not None and not behaviors_df.empty) else set()
    alert_mmsi = set(alerts_df["mmsi"].astype(str).tolist())    if (alerts_df   is not None and not alerts_df.empty)   else set()
    confirmed_double = beh_mmsi & alert_mmsi

    confirmed_suspicious = confirmed_from_registry | confirmed_double
    print(f"  [graph_scoring] Route baseline: {len(confirmed_suspicious)} confirmed suspicious ships "
          f"({len(confirmed_from_registry)} registry, {len(confirmed_double)} double-confirmed)")

    susp_routes = {m: fp for m, fp in fingerprints.items() if m in confirmed_suspicious}

    scores = {}
    for mmsi, route in fingerprints.items():
        if not susp_routes or mmsi in confirmed_suspicious:
            scores[mmsi] = 0.0
            continue
        max_sim = max(jaccard(route, sr) for sr in susp_routes.values())
        scores[mmsi] = round(max_sim if max_sim >= ROUTE_SIM_THRESHOLD else 0.0, 4)
    return scores


def compute_behavior_scores(anomalies_df, alerts_df, behaviors_df) -> dict:
    """Boolean per ship per type — NOT additive per instance."""
    frames = []
    for df in [anomalies_df, alerts_df, behaviors_df]:
        if df is not None and not df.empty and "type" in df.columns:
            frames.append(df[["mmsi", "type"]])
    if not frames:
        return {}
    all_anom = pd.concat(frames, ignore_index=True)
    all_anom["mmsi"] = all_anom["mmsi"].astype(str)
    scores = {}
    for mmsi, group in all_anom.groupby("mmsi"):
        types = set(group["type"].tolist())
        raw = sum(BEHAVIOR_WEIGHTS.get(t, 0.05) for t in types)
        scores[str(mmsi)] = round(min(raw, 1.0), 4)
    return scores


def compute_zone_scores(ais_df: pd.DataFrame, zones_df: pd.DataFrame) -> dict:
    """Zone score based on last known position."""
    last_pos = (
        ais_df.sort_values("timestamp")
              .groupby("mmsi").last()
              .reset_index()
    )
    last_pos["mmsi"] = last_pos["mmsi"].astype(str)
    scores = {row["mmsi"]: 0.0 for _, row in last_pos.iterrows()}
    for _, ship in last_pos.iterrows():
        best = 0.0
        for _, zone in zones_df.iterrows():
            try:
                pts = str(zone["coordinates"]).split(";")
                lat1, lon1 = map(float, pts[0].split(","))
                lat2, lon2 = map(float, pts[1].split(","))
                if (min(lat1, lat2) <= ship["latitude"] <= max(lat1, lat2) and
                        min(lon1, lon2) <= ship["longitude"] <= max(lon1, lon2)):
                    best = max(best, RISK_MAP_ZONE.get(zone["risk_level"], 0.0))
            except Exception:
                continue
        scores[str(ship["mmsi"])] = best
    return scores


# ── Master function ───────────────────────────────────────────────────────────

def compute_graph_scores(
    ais_df: pd.DataFrame,
    anomalies_df: pd.DataFrame,
    alerts_df: pd.DataFrame,
    behaviors_df: pd.DataFrame,
    zones_df: pd.DataFrame,
    ships_df: pd.DataFrame = None,
):
    """
    Combine all 4 dimensions into a final suspicion score [0, 1].

    Returns
    -------
    scored_ais  : AIS DataFrame enriched with score columns
    G           : NetworkX proximity graph
    metrics_df  : one row per unique MMSI with all sub-scores
    """
    print("[graph_scoring] Building proximity graph...")
    G, last_pos = build_proximity_graph(ais_df)
    print(f"  {G.number_of_nodes()} ships, {G.number_of_edges()} proximity edges "
          f"(< {PROXIMITY_KM:.1f} km / 20 nm)")

    all_mmsi = ais_df["mmsi"].astype(str).unique().tolist()

    print("[graph_scoring] Computing isolation scores (percentile-based)...")
    iso_scores = compute_isolation_scores(G, all_mmsi)

    print("[graph_scoring] Computing route fingerprints...")
    fingerprints = compute_route_fingerprints(ais_df)

    print("[graph_scoring] Computing route similarity scores (confirmed-suspicious baseline)...")
    rts_scores = compute_route_similarity_scores(
        fingerprints, anomalies_df, alerts_df, behaviors_df, ships_df
    )

    print("[graph_scoring] Computing behavior scores...")
    beh_scores = compute_behavior_scores(anomalies_df, alerts_df, behaviors_df)

    print("[graph_scoring] Computing zone scores...")
    zone_scores = compute_zone_scores(ais_df, zones_df)

    records = []
    for mmsi in all_mmsi:
        iso  = iso_scores.get(mmsi, 0.5)
        beh  = beh_scores.get(mmsi, 0.0)
        rts  = rts_scores.get(mmsi, 0.0)
        zone = zone_scores.get(mmsi, 0.0)
        deg  = G.degree(mmsi) if mmsi in G else 0

        score = round(float(np.clip(
            WEIGHTS["isolation"] * iso  +
            WEIGHTS["behavior"]  * beh  +
            WEIGHTS["route_sim"] * rts  +
            WEIGHTS["zone"]      * zone,
            0.0, 1.0
        )), 4)

        # Fix 3 — hard constraint: no behavior evidence → cap at Suspect
        if beh == 0.0 and score >= 0.6:
            score = 0.55

        if   score >= 0.8: risk = "Ghost Fleet"
        elif score >= 0.6: risk = "Critical"
        elif score >= 0.3: risk = "Suspect"
        else:              risk = "Normal"

        records.append({
            "mmsi":            mmsi,
            "score":           score,
            "risk_level":      risk,
            "isolation_score": round(iso,  4),
            "behavior_score":  round(beh,  4),
            "route_sim_score": round(rts,  4),
            "zone_score":      round(zone, 4),
            "graph_degree":    deg,
        })

    metrics_df = pd.DataFrame(records)

    # Fix 5 — distribution check
    n_total    = len(metrics_df)
    n_critical = metrics_df["risk_level"].isin(["Critical", "Ghost Fleet"]).sum()
    pct        = n_critical / n_total * 100 if n_total else 0

    print(f"\n[graph_scoring] Score distribution:")
    print(metrics_df["risk_level"].value_counts().to_string())
    print(f"\n  Critical + Ghost Fleet : {n_critical} / {n_total} ({pct:.1f}%)")
    if pct > 15:
        print("  WARNING: >15% Critical/Ghost Fleet — calibration may still be off")
        print("  Expected: ~5% Critical, ~2% Ghost Fleet for a realistic dataset")
    else:
        print("  OK — distribution looks realistic")

    scored = ais_df.copy()
    scored["mmsi"] = scored["mmsi"].astype(str)
    scored = scored.merge(
        metrics_df[[
            "mmsi", "score", "risk_level", "graph_degree",
            "isolation_score", "behavior_score", "route_sim_score", "zone_score"
        ]],
        on="mmsi", how="left"
    )
    scored["score"]      = scored["score"].fillna(0.0)
    scored["risk_level"] = scored["risk_level"].fillna("Normal")

    return scored, G, metrics_df
