"""
graph_scoring.py
Graph-theory-based suspicion scoring for maritime traffic.

4 dimensions:
  isolation  (0.35) — ghost ships travel alone; degree=0 in the proximity graph
  behavior   (0.25) — AIS/MMSI/speed violations (boolean per type, not per instance)
  route_sim  (0.25) — Jaccard similarity with routes of known suspicious ships
  zone       (0.15) — presence in a sanctioned geographic zone
"""

import networkx as nx
import pandas as pd
import numpy as np
from math import radians, sin, cos, sqrt, atan2

# ── Constants ─────────────────────────────────────────────────────────────────

# 20 nautical miles converted to km (1 nm = 1.852 km)
PROXIMITY_KM = 20 * 1.852

# Grid cell size for route fingerprinting: 3° ≈ 300 km
GRID_DEGREES = 3

# Dimension weights
WEIGHTS = {
    "isolation": 0.35,
    "behavior":  0.25,
    "route_sim": 0.25,
    "zone":      0.15,
}

# Per-type behavior weights (boolean per ship — not additive across instances)
BEHAVIOR_WEIGHTS = {
    "AIS Disabled":   0.40,  # SOLAS Chapter V Regulation 19.2.4
    "MMSI Spoofing":  0.35,  # Identity fraud — hardest to detect
    "Name Change":    0.30,  # UN Panel of Experts Report S/2023/171
    "Speed Anomaly":  0.25,  # IMO max commercial speed = 25 knots
    "Fake Position":  0.20,  # GPS teleportation is physically impossible
    "Zone Violation": 0.15,  # Presence in sanctioned zone
    "Zone Crossing":  0.15,  # Same behavior, alternate CSV label
    "Course Anomaly": 0.10,  # IMO COLREGS Rule 8
    "ML Anomaly":     0.10,  # Isolation Forest signal
}

RISK_MAP_ZONE = {"Critical": 1.0, "High": 0.5, "Medium": 0.2, "Low": 0.0}


# ── Helpers ───────────────────────────────────────────────────────────────────

def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km (Haversine formula)."""
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
    Ghost fleet ships have degree 0 (completely isolated).
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
    isolation = 1 - min(degree / 10, 1)
    Degree 0  -> 1.00  (alone — maximum suspicion)
    Degree 10 -> 0.00  (well-connected shipping lane)
    """
    scores = {}
    for mmsi in all_mmsi:
        degree = G.degree(str(mmsi)) if str(mmsi) in G else 0
        scores[str(mmsi)] = round(max(0.0, 1.0 - min(degree / 10.0, 1.0)), 4)
    return scores


def compute_route_fingerprints(ais_df: pd.DataFrame) -> dict:
    """
    Route fingerprint = set of 3x3 degree grid cells visited.
    cell_id = int(lat/3) * 10000 + int(lon/3)
    """
    df = ais_df.copy()
    df["mmsi"] = df["mmsi"].astype(str)
    df["cell"] = (
        (df["latitude"] / GRID_DEGREES).astype(int) * 10000 +
        (df["longitude"] / GRID_DEGREES).astype(int)
    )
    return df.groupby("mmsi")["cell"].apply(set).to_dict()


def compute_route_similarity_scores(fingerprints: dict, suspicious_mmsi: set) -> dict:
    """
    For each ship: max Jaccard similarity with any known suspicious ship's route.
    """
    susp_routes = {m: fp for m, fp in fingerprints.items() if m in suspicious_mmsi}
    scores = {}
    for mmsi, route in fingerprints.items():
        if not susp_routes:
            scores[mmsi] = 0.0
        else:
            scores[mmsi] = round(
                max(jaccard(route, sr) for sr in susp_routes.values()), 4
            )
    return scores


def compute_behavior_scores(anomalies_df, alerts_df, behaviors_df) -> dict:
    """
    Boolean per ship per type — NOT additive per instance.
    """
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
    """
    Zone score based on last known position.
    Critical = 1.0, High = 0.5, Medium = 0.2, Low = 0.0
    """
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
    print(f"  {G.number_of_nodes()} ships, {G.number_of_edges()} proximity edges (< {PROXIMITY_KM:.1f} km / 20 nm)")

    all_mmsi = ais_df["mmsi"].astype(str).unique().tolist()

    print("[graph_scoring] Computing isolation scores...")
    iso_scores = compute_isolation_scores(G, all_mmsi)

    print("[graph_scoring] Computing route fingerprints...")
    fingerprints = compute_route_fingerprints(ais_df)

    frames = [df for df in [anomalies_df, alerts_df, behaviors_df]
              if df is not None and not df.empty]
    suspicious_mmsi = set(
        pd.concat(frames)["mmsi"].astype(str).tolist()
    ) if frames else set()

    rts_scores = compute_route_similarity_scores(fingerprints, suspicious_mmsi)

    print("[graph_scoring] Computing behavior scores...")
    beh_scores = compute_behavior_scores(anomalies_df, alerts_df, behaviors_df)

    print("[graph_scoring] Computing zone scores...")
    zone_scores = compute_zone_scores(ais_df, zones_df)

    records = []
    for mmsi in all_mmsi:
        iso  = iso_scores.get(mmsi, 1.0)
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

    print("[graph_scoring] Risk distribution (unique ships):")
    print(metrics_df["risk_level"].value_counts().to_string())

    return scored, G, metrics_df
