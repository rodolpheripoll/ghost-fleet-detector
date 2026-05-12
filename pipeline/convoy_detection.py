"""
convoy_detection.py
Détection de groupes de navires via la méthode H3 d'Uber.

H3 (Hierarchical Hexagonal Geospatial Indexing System) — Uber Engineering 2018
https://h3geo.org/

Principe : l'océan est divisé en cellules hexagonales hiérarchiques.
Les navires dans la même cellule ou des cellules adjacentes forment un groupe.

Résolution choisie : H3 resolution 5
  → aire moyenne d'une cellule ≈ 252 km²
  → rayon moyen ≈ 9 nm
  → en incluant les voisins directs (k=1) : rayon ≈ 20 nm

Avantages vs Haversine O(n²) :
  - O(n) pour l'assignation des cellules
  - Cellules hexagonales = meilleure représentation spatiale
  - Hiérarchique : facile de changer la granularité
"""

import json
from collections import defaultdict
from math import radians, sin, cos, sqrt, atan2

import h3
import numpy as np
import pandas as pd

# H3 resolution 5: hexagon area ≈ 252 km², radius ≈ 9 nm
# grid_disk(cell, 1) includes the cell + its 6 neighbours → effective radius ≈ 20 nm
H3_RESOLUTION = 5

# Minimum ships to count as a valid convoy
MIN_CONVOY_SIZE = 2

RISK_ORDER = {"Ghost Fleet": 4, "Critical": 3, "Suspect": 2, "Normal": 1}


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * R * atan2(sqrt(a), sqrt(1 - a))


def _convoy_risk(avg_score):
    if avg_score > 0.5:
        return "High"
    if avg_score > 0.3:
        return "Medium"
    return "Low"


def detect_convoys(ais_df: pd.DataFrame):
    """
    Detect ship convoys via Uber H3 hexagonal grid clustering.

    Parameters
    ----------
    ais_df : AIS DataFrame (optionally enriched with 'score' and 'risk_level')

    Returns
    -------
    G            : None (no NetworkX graph — H3 replaces it)
    ships_df     : ais_df + convoy_id (int), convoy_size, convoy_risk columns
    convoy_stats : DataFrame with one row per convoy
    convoy_edges : DataFrame of ship pairs within the same convoy
    """
    df = ais_df.copy()
    df["mmsi"] = df["mmsi"].astype(str)

    # Last known position per ship
    last_pos = (
        df.sort_values("timestamp")
          .groupby("mmsi").last()
          .reset_index()
          .dropna(subset=["latitude", "longitude"])
    )

    print(f"[convoy_detection] H3 resolution {H3_RESOLUTION} — "
          f"assigning {len(last_pos)} ships to hexagonal cells...")

    # ── Step 1: assign each ship to its H3 cell ───────────────────────────────
    last_pos["h3_cell"] = last_pos.apply(
        lambda r: h3.latlng_to_cell(r["latitude"], r["longitude"], H3_RESOLUTION),
        axis=1,
    )

    # ── Step 2: build cell → ships mapping (cell + neighbours k=1) ────────────
    cell_to_ships: dict = defaultdict(list)
    for _, row in last_pos.iterrows():
        neighbors = h3.grid_disk(row["h3_cell"], 1)
        for cell in neighbors:
            cell_to_ships[cell].append(row["mmsi"])

    # ── Step 3: Union-Find clustering ─────────────────────────────────────────
    parent = {mmsi: mmsi for mmsi in last_pos["mmsi"]}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    for ships_in_cell in cell_to_ships.values():
        unique = list(set(ships_in_cell))
        for i in range(len(unique) - 1):
            union(unique[i], unique[i + 1])

    # Group by root
    raw_groups: dict = defaultdict(list)
    for mmsi in last_pos["mmsi"]:
        raw_groups[find(mmsi)].append(mmsi)

    # ── Step 4: keep only groups with >= MIN_CONVOY_SIZE ships ───────────────
    valid_groups = [
        sorted(mmsi_list)
        for mmsi_list in raw_groups.values()
        if len(mmsi_list) >= MIN_CONVOY_SIZE
    ]
    singletons = [
        mmsi_list
        for mmsi_list in raw_groups.values()
        if len(mmsi_list) < MIN_CONVOY_SIZE
    ]

    print(f"  {len(valid_groups)} convoys (≥{MIN_CONVOY_SIZE} ships), "
          f"{len(singletons)} isolated ships")

    # ── Step 5: build convoy lookup ───────────────────────────────────────────
    has_score      = "score"      in df.columns
    has_risk_level = "risk_level" in df.columns

    # Compute per-ship score lookup for centroid/risk calcs
    ship_scores = {}
    ship_risks  = {}
    if has_score:
        ship_scores = df.drop_duplicates("mmsi").set_index("mmsi")["score"].to_dict()
    if has_risk_level:
        ship_risks = df.drop_duplicates("mmsi").set_index("mmsi")["risk_level"].to_dict()

    mmsi_to_convoy: dict = {}
    convoy_stats_rows = []

    for convoy_id, mmsi_list in enumerate(valid_groups, start=1):
        size = len(mmsi_list)
        scores = [float(ship_scores.get(m, 0)) for m in mmsi_list]
        avg_sc = round(float(np.mean(scores)), 4) if scores else 0.0
        risk   = _convoy_risk(avg_sc)

        risks  = [ship_risks.get(m, "Normal") for m in mmsi_list]
        top_risk_raw = max(risks, key=lambda r: RISK_ORDER.get(r, 0))
        contains_gf  = any(r == "Ghost Fleet" for r in risks)

        positions = last_pos[last_pos["mmsi"].isin(mmsi_list)]
        c_lat = round(float(positions["latitude"].mean()),  4)
        c_lon = round(float(positions["longitude"].mean()), 4)

        for mmsi in mmsi_list:
            mmsi_to_convoy[mmsi] = {
                "convoy_id":   convoy_id,
                "convoy_size": size,
                "convoy_risk": risk,
            }

        convoy_stats_rows.append({
            "convoy_id":            convoy_id,
            "size":                 size,
            "risk_level":           top_risk_raw,
            "convoy_risk":          risk,
            "avg_score":            avg_sc,
            "centroid_lat":         c_lat,
            "centroid_lon":         c_lon,
            "contains_ghost_fleet": contains_gf,
            "mmsi_list":            json.dumps(mmsi_list),
        })

    # Singletons → convoy_id = 0
    for mmsi_list in singletons:
        for mmsi in mmsi_list:
            mmsi_to_convoy[mmsi] = {
                "convoy_id":   0,
                "convoy_size": 1,
                "convoy_risk": "Low",
            }

    # ── Step 6: build edges (ship pairs within same convoy) ──────────────────
    edge_records = []
    for convoy_id, mmsi_list in enumerate(valid_groups, start=1):
        positions = last_pos[last_pos["mmsi"].isin(mmsi_list)].set_index("mmsi")
        for i in range(len(mmsi_list)):
            for j in range(i + 1, len(mmsi_list)):
                a, b = mmsi_list[i], mmsi_list[j]
                if a in positions.index and b in positions.index:
                    ra, rb = positions.loc[a], positions.loc[b]
                    dist_km = _haversine_km(ra["latitude"], ra["longitude"],
                                            rb["latitude"], rb["longitude"])
                    edge_records.append({
                        "source":      a,
                        "target":      b,
                        "convoy_id":   convoy_id,
                        "distance_km": round(dist_km, 2),
                        "distance_nm": round(dist_km / 1.852, 2),
                    })

    # ── Step 7: annotate ais_df ───────────────────────────────────────────────
    convoy_lookup = pd.DataFrame.from_dict(mmsi_to_convoy, orient="index").reset_index()
    convoy_lookup.columns = ["mmsi", "convoy_id", "convoy_size", "convoy_risk"]

    ships_df = df.merge(convoy_lookup, on="mmsi", how="left")
    ships_df["convoy_id"]   = ships_df["convoy_id"].fillna(0).astype(int)
    ships_df["convoy_size"] = ships_df["convoy_size"].fillna(1).astype(int)
    ships_df["convoy_risk"] = ships_df["convoy_risk"].fillna("Low")

    convoy_stats = pd.DataFrame(convoy_stats_rows) if convoy_stats_rows else pd.DataFrame(
        columns=["convoy_id","size","risk_level","convoy_risk","avg_score",
                 "centroid_lat","centroid_lon","contains_ghost_fleet","mmsi_list"]
    )
    convoy_edges = pd.DataFrame(edge_records) if edge_records else pd.DataFrame(
        columns=["source","target","convoy_id","distance_km","distance_nm"]
    )

    print(f"  Ships in convoys: {(ships_df['convoy_id'] > 0).sum()}, "
          f"convoy_edges: {len(convoy_edges)}")

    return None, ships_df, convoy_stats, convoy_edges
