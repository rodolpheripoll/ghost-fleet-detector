"""
convoy_detection.py
Detect ship convoys using proximity clustering.

A convoy = group of ships travelling within PROXIMITY_KM of each other.
Uses NetworkX connected components on a proximity graph (same 20 nm threshold
as graph_scoring).
"""

import networkx as nx
import pandas as pd
import numpy as np
from math import radians, sin, cos, sqrt, atan2

PROXIMITY_KM = 20 * 1.852  # 20 nautical miles


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * R * atan2(sqrt(a), sqrt(1 - a))


def detect_convoys(scored_df: pd.DataFrame, proximity_km: float = PROXIMITY_KM):
    """
    Detect ship convoys from scored AIS data.

    Parameters
    ----------
    scored_df    : AIS DataFrame already enriched with 'score' and 'risk_level'
    proximity_km : edge threshold in km (default 20 nm = 37.04 km)

    Returns
    -------
    G            : NetworkX proximity graph
    ships_df     : scored_df + convoy_id, convoy_size, convoy_risk columns
    convoy_stats : DataFrame with one row per convoy
    convoy_edges : DataFrame with all proximity pairs
    """
    print("[convoy_detection] Building convoy proximity graph...")

    # Use last known position per ship
    df = scored_df.copy()
    df["mmsi"] = df["mmsi"].astype(str)
    last_pos = (
        df.sort_values("timestamp")
          .groupby("mmsi").last()
          .reset_index()
          .dropna(subset=["latitude", "longitude"])
    )

    G = nx.Graph()
    for _, row in last_pos.iterrows():
        G.add_node(str(row["mmsi"]),
                   lat=row["latitude"],
                   lon=row["longitude"],
                   score=float(row.get("score") or 0),
                   risk_level=str(row.get("risk_level") or "Normal"))

    edge_records = []
    nodes = list(G.nodes(data=True))
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            mmsi_a, da = nodes[i]
            mmsi_b, db = nodes[j]
            dist = _haversine_km(da["lat"], da["lon"], db["lat"], db["lon"])
            if dist <= proximity_km:
                G.add_edge(mmsi_a, mmsi_b, distance_km=round(dist, 2))
                edge_records.append({
                    "source": mmsi_a,
                    "target": mmsi_b,
                    "distance_km": round(dist, 2),
                    "distance_nm": round(dist / 1.852, 2),
                })

    # Connected components = convoys
    components = list(nx.connected_components(G))
    print(f"  {len(components)} convoys detected ({G.number_of_edges()} proximity pairs)")

    # Build convoy lookup
    mmsi_to_convoy = {}
    convoy_stats_rows = []
    RISK_ORDER = {"Ghost Fleet": 4, "Critical": 3, "Suspect": 2, "Normal": 1}

    for idx, component in enumerate(components):
        convoy_id = f"convoy_{idx:04d}"
        size = len(component)
        # Convoy risk = highest member risk
        member_risks = [
            G.nodes[m].get("risk_level", "Normal") for m in component
        ]
        top_risk = max(member_risks, key=lambda r: RISK_ORDER.get(r, 0))
        avg_score = round(
            float(np.mean([G.nodes[m].get("score", 0) for m in component])), 4
        )
        # Centroid
        lats = [G.nodes[m]["lat"] for m in component if "lat" in G.nodes[m]]
        lons = [G.nodes[m]["lon"] for m in component if "lon" in G.nodes[m]]
        centroid_lat = round(float(np.mean(lats)), 4) if lats else None
        centroid_lon = round(float(np.mean(lons)), 4) if lons else None

        for mmsi in component:
            mmsi_to_convoy[str(mmsi)] = {
                "convoy_id":   convoy_id,
                "convoy_size": size,
                "convoy_risk": top_risk,
            }

        convoy_stats_rows.append({
            "convoy_id":    convoy_id,
            "size":         size,
            "risk_level":   top_risk,
            "avg_score":    avg_score,
            "centroid_lat": centroid_lat,
            "centroid_lon": centroid_lon,
        })

    # Annotate ships
    convoy_lookup = pd.DataFrame.from_dict(mmsi_to_convoy, orient="index").reset_index()
    convoy_lookup.columns = ["mmsi", "convoy_id", "convoy_size", "convoy_risk"]

    ships_df = df.merge(convoy_lookup, on="mmsi", how="left")
    ships_df["convoy_id"]   = ships_df["convoy_id"].fillna("singleton")
    ships_df["convoy_size"] = ships_df["convoy_size"].fillna(1).astype(int)
    ships_df["convoy_risk"] = ships_df["convoy_risk"].fillna(ships_df["risk_level"])

    convoy_stats = pd.DataFrame(convoy_stats_rows)
    convoy_edges = pd.DataFrame(edge_records) if edge_records else pd.DataFrame(
        columns=["source", "target", "distance_km", "distance_nm"]
    )

    print(f"  Convoy sizes: min={convoy_stats['size'].min()}, "
          f"max={convoy_stats['size'].max()}, "
          f"mean={convoy_stats['size'].mean():.1f}")

    return G, ships_df, convoy_stats, convoy_edges
