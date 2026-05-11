"""
knowledge_graph.py
Build a NetworkX knowledge graph connecting ships, zones, and behaviors.
"""

import pandas as pd
import networkx as nx
from itertools import combinations

# Co-location parameters
# Two ships are "co-located" if they are within 0.1° of each other at
# overlapping times (±30 min window). This can indicate ship-to-ship
# transfer or coordinated fleet activity.
CO_LOCATION_DIST   = 0.1   # degrees (~11 km)
CO_LOCATION_WINDOW = 30    # minutes


def _parse_timestamp(ts) -> pd.Timestamp:
    if pd.isna(ts):
        return pd.NaT
    return pd.Timestamp(ts)


def build_graph(
    ais_df: pd.DataFrame,
    anomalies_df: pd.DataFrame,
    zones_df: pd.DataFrame,
) -> tuple[nx.DiGraph, pd.DataFrame, pd.DataFrame]:
    """
    Build a directed knowledge graph with three node types:
        - Ship   (id = mmsi)
        - Zone   (id = zone_id)
        - Behavior (id = anomaly type string)

    Edges:
        Ship → Zone      : label='traversed'  (ship position inside zone bbox)
        Ship → Behavior  : label='exhibited'  (ship had anomaly of this type)
        Ship → Ship      : label='co-located' (within CO_LOCATION_DIST° ± CO_LOCATION_WINDOW min)

    Returns
    -------
    graph    : nx.DiGraph
    nodes_df : pd.DataFrame (id, type, label, score, risk_level, centrality)
    edges_df : pd.DataFrame (source, target, label)
    """
    print("[knowledge_graph] Building knowledge graph...")

    G = nx.DiGraph()

    scored = ais_df.copy()
    scored["mmsi"] = scored["mmsi"].astype(str)

    # ── Per-ship aggregates ───────────────────────────────────────────────────
    ship_latest = (
        scored.sort_values("timestamp")
        .groupby("mmsi")
        .last()
        .reset_index()
    )

    # ── Add Ship nodes ────────────────────────────────────────────────────────
    for _, row in ship_latest.iterrows():
        mmsi  = str(row["mmsi"])
        score = float(row.get("score", 0.0))
        G.add_node(
            mmsi,
            type       = "ship",
            label      = mmsi,
            score      = score,
            risk_level = row.get("risk_level", "Normal"),
        )

    # ── Add Zone nodes ────────────────────────────────────────────────────────
    for _, zone in zones_df.iterrows():
        zid = str(zone.get("zone_id", zone.get("name", "unknown")))
        G.add_node(
            zid,
            type       = "zone",
            label      = str(zone.get("name", zid)),
            score      = 0.0,
            risk_level = str(zone.get("risk_level", "Low")),
        )

    # ── Add Behavior nodes ────────────────────────────────────────────────────
    if not anomalies_df.empty:
        for btype in anomalies_df["type"].unique():
            G.add_node(
                btype,
                type       = "behavior",
                label      = btype,
                score      = 0.0,
                risk_level = "N/A",
            )

    # ── Edges: Ship → Behavior ────────────────────────────────────────────────
    edges = []
    if not anomalies_df.empty:
        for _, row in anomalies_df.iterrows():
            mmsi  = str(row["mmsi"])
            btype = str(row["type"])
            if G.has_node(mmsi) and G.has_node(btype):
                if not G.has_edge(mmsi, btype):
                    G.add_edge(mmsi, btype, label="exhibited")
                    edges.append({"source": mmsi, "target": btype, "label": "exhibited"})

    # ── Edges: Ship → Zone (traversed) ───────────────────────────────────────
    for _, zone in zones_df.iterrows():
        lat_min = zone.get("lat_min")
        lat_max = zone.get("lat_max")
        lon_min = zone.get("lon_min")
        lon_max = zone.get("lon_max")
        zid     = str(zone.get("zone_id", zone.get("name", "unknown")))
        if any(v is None for v in [lat_min, lat_max, lon_min, lon_max]):
            continue
        mask = (
            scored["latitude"].between(lat_min, lat_max) &
            scored["longitude"].between(lon_min, lon_max)
        )
        traversing_mmsi = scored[mask]["mmsi"].unique()
        for mmsi in traversing_mmsi:
            if G.has_node(mmsi) and G.has_node(zid) and not G.has_edge(mmsi, zid):
                G.add_edge(mmsi, zid, label="traversed")
                edges.append({"source": mmsi, "target": zid, "label": "traversed"})

    # ── Edges: Ship → Ship (co-located) ──────────────────────────────────────
    # For performance, compare only the most recent position of each ship.
    ship_positions = ship_latest[["mmsi", "latitude", "longitude", "timestamp"]].copy()
    ship_positions["timestamp"] = ship_positions["timestamp"].apply(_parse_timestamp)

    mmsi_list = ship_positions["mmsi"].tolist()
    for i, j in combinations(range(len(ship_positions)), 2):
        row_i = ship_positions.iloc[i]
        row_j = ship_positions.iloc[j]
        dist  = abs(row_i["latitude"] - row_j["latitude"]) + \
                abs(row_i["longitude"] - row_j["longitude"])
        if dist > CO_LOCATION_DIST:
            continue
        # Check time overlap
        ts_i = row_i["timestamp"]
        ts_j = row_j["timestamp"]
        if pd.isna(ts_i) or pd.isna(ts_j):
            continue
        dt_min = abs((ts_i - ts_j).total_seconds()) / 60
        if dt_min <= CO_LOCATION_WINDOW:
            mi = str(row_i["mmsi"])
            mj = str(row_j["mmsi"])
            if not G.has_edge(mi, mj):
                G.add_edge(mi, mj, label="co-located")
                edges.append({"source": mi, "target": mj, "label": "co-located"})

    # ── Degree centrality ─────────────────────────────────────────────────────
    centrality = nx.degree_centrality(G)

    # ── Build DataFrames ──────────────────────────────────────────────────────
    node_records = []
    for node_id, attrs in G.nodes(data=True):
        node_records.append({
            "id":         node_id,
            "type":       attrs.get("type", "unknown"),
            "label":      attrs.get("label", node_id),
            "score":      attrs.get("score", 0.0),
            "risk_level": attrs.get("risk_level", "Normal"),
            "centrality": round(centrality.get(node_id, 0.0), 6),
        })

    nodes_df = pd.DataFrame(node_records)
    edges_df = pd.DataFrame(edges)

    print(f"[knowledge_graph] Graph: {G.number_of_nodes()} nodes, "
          f"{G.number_of_edges()} edges "
          f"({len(edges_df[edges_df['label']=='co-located'])} co-located pairs)")

    return G, nodes_df, edges_df
