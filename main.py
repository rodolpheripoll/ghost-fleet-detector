"""
main.py
Ghost Fleet Detection — Pipeline orchestrator.

Runs TWO scoring pipelines and pushes results to separate Supabase tables:
  DEMO  pipeline  → rules + Isolation Forest  → table 'ships'
  GRAPH pipeline  → graph theory scoring       → table 'ships_graph'

SUPABASE TABLES — run these in the Supabase SQL editor before executing:

    CREATE TABLE ships (
      mmsi         TEXT PRIMARY KEY,
      timestamp    TIMESTAMPTZ,
      latitude     FLOAT,
      longitude    FLOAT,
      speed        FLOAT,
      course       FLOAT,
      status       TEXT,
      ais_active   BOOLEAN,
      score        FLOAT   DEFAULT 0,
      risk_level   TEXT    DEFAULT 'Normal',
      prior_risk_score FLOAT DEFAULT 0,
      convoy_id    TEXT,
      convoy_size  INTEGER DEFAULT 1,
      convoy_risk  TEXT    DEFAULT 'Normal'
    );

    CREATE TABLE ships_graph (
      mmsi              TEXT PRIMARY KEY,
      timestamp         TIMESTAMPTZ,
      latitude          FLOAT,
      longitude         FLOAT,
      speed             FLOAT,
      course            FLOAT,
      status            TEXT,
      ais_active        BOOLEAN,
      score             FLOAT DEFAULT 0,
      risk_level        TEXT  DEFAULT 'Normal',
      isolation_score   FLOAT DEFAULT 0,
      behavior_score    FLOAT DEFAULT 0,
      route_sim_score   FLOAT DEFAULT 0,
      zone_score        FLOAT DEFAULT 0,
      graph_degree      INTEGER DEFAULT 0
    );

    CREATE TABLE anomalies (
      id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      mmsi         TEXT,
      type         TEXT,
      description  TEXT,
      timestamp    TIMESTAMPTZ,
      confidence   FLOAT,
      detected_by  TEXT
    );

    CREATE TABLE risk_zones (
      zone_id      TEXT PRIMARY KEY,
      name         TEXT,
      lat_min      FLOAT,
      lat_max      FLOAT,
      lon_min      FLOAT,
      lon_max      FLOAT,
      risk_level   TEXT,
      description  TEXT
    );

    CREATE TABLE graph_nodes (
      id           TEXT PRIMARY KEY,
      type         TEXT,
      label        TEXT,
      score        FLOAT,
      risk_level   TEXT,
      centrality   FLOAT
    );

    CREATE TABLE graph_edges (
      id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      source       TEXT,
      target       TEXT,
      label        TEXT
    );

    CREATE TABLE convoys (
      convoy_id    TEXT PRIMARY KEY,
      size         INTEGER,
      risk_level   TEXT,
      avg_score    FLOAT,
      centroid_lat FLOAT,
      centroid_lon FLOAT
    );

    CREATE TABLE convoy_edges (
      id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      source       TEXT,
      target       TEXT,
      distance_km  FLOAT,
      distance_nm  FLOAT
    );
"""

import os
import math
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

from pipeline.ingestion        import load_data
from pipeline.cleaning         import clean_data
from pipeline.anomaly_detection import detect_anomalies
from pipeline.scoring          import compute_scores
from pipeline.graph_scoring    import compute_graph_scores
from pipeline.convoy_detection import detect_convoys
from pipeline.knowledge_graph  import build_graph
from pipeline.report_generator import generate_pdf_report


def _serialize(df: pd.DataFrame) -> list[dict]:
    """Convert a DataFrame to a list of JSON-serialisable dicts for Supabase."""
    records = df.copy()
    for col in records.columns:
        if pd.api.types.is_datetime64_any_dtype(records[col]):
            records[col] = records[col].apply(
                lambda x: None if pd.isna(x) else x.isoformat()
            )
    records = records.where(pd.notnull(records), None)
    result = records.to_dict("records")
    for row in result:
        for k, v in row.items():
            if v == "NaT" or v == "nan":
                row[k] = None
    return result


def push_demo_pipeline(supabase, scored, anomalies, zones, nodes, edges,
                       convoy_stats, convoy_edges):
    """Push DEMO pipeline results to Supabase (table: ships)."""
    ships_cols = [
        "mmsi", "timestamp", "latitude", "longitude",
        "speed", "course", "status", "ais_active",
        "score", "risk_level", "prior_risk_score",
        "convoy_id", "convoy_size", "convoy_risk",
    ]
    available  = [c for c in ships_cols if c in scored.columns]
    ships_data = (
        scored[available]
        .sort_values("timestamp")
        .drop_duplicates("mmsi", keep="last")
    )
    supabase.table("ships").upsert(_serialize(ships_data)).execute()
    print(f"  [Supabase] ships         -> {len(ships_data)} rows upserted")

    if not anomalies.empty:
        supabase.table("anomalies").insert(_serialize(anomalies)).execute()
        print(f"  [Supabase] anomalies     -> {len(anomalies)} rows inserted")

    zone_cols = ["zone_id", "name", "lat_min", "lat_max",
                 "lon_min", "lon_max", "risk_level", "description"]
    avail_z = [c for c in zone_cols if c in zones.columns]
    supabase.table("risk_zones").upsert(_serialize(zones[avail_z])).execute()
    print(f"  [Supabase] risk_zones    -> {len(zones)} rows upserted")

    if not nodes.empty:
        supabase.table("graph_nodes").upsert(_serialize(nodes)).execute()
        print(f"  [Supabase] graph_nodes   -> {len(nodes)} rows upserted")

    if not edges.empty:
        supabase.table("graph_edges").insert(_serialize(edges)).execute()
        print(f"  [Supabase] graph_edges   -> {len(edges)} rows inserted")

    if not convoy_stats.empty:
        supabase.table("convoys").upsert(_serialize(convoy_stats)).execute()
        print(f"  [Supabase] convoys       -> {len(convoy_stats)} rows upserted")

    if not convoy_edges.empty:
        supabase.table("convoy_edges").insert(_serialize(convoy_edges)).execute()
        print(f"  [Supabase] convoy_edges  -> {len(convoy_edges)} rows inserted")

    print("  [Supabase] DEMO pipeline pushed successfully.")


def push_graph_pipeline(supabase, graph_scored):
    """Push GRAPH pipeline results to Supabase (table: ships_graph)."""
    graph_cols = [
        "mmsi", "timestamp", "latitude", "longitude",
        "speed", "course", "status", "ais_active",
        "score", "risk_level",
        "isolation_score", "behavior_score", "route_sim_score",
        "zone_score", "graph_degree",
    ]
    available = [c for c in graph_cols if c in graph_scored.columns]
    ships_data = (
        graph_scored[available]
        .sort_values("timestamp")
        .drop_duplicates("mmsi", keep="last")
    )
    supabase.table("ships_graph").upsert(_serialize(ships_data)).execute()
    print(f"  [Supabase] ships_graph   -> {len(ships_data)} rows upserted")
    print("  [Supabase] GRAPH pipeline pushed successfully.")


if __name__ == "__main__":
    print("=" * 60)
    print("  Ghost Fleet Detection Pipeline")
    print("=" * 60)

    # 1. Ingest
    data = load_data()

    # 2. Clean
    clean, quality_report = clean_data(data)

    # ── DEMO PIPELINE (rules + Isolation Forest) ──────────────────────────────
    print("\n── DEMO PIPELINE (rules + Isolation Forest) ──")
    anomalies = detect_anomalies(
        clean["ais"], clean["zones"],
        behaviors_df=clean.get("behaviors"),
        alerts_df=clean.get("alerts"),
    )
    scored = compute_scores(
        clean["ais"], anomalies, clean["zones"],
        ships_df=clean.get("ships")
    )
    _convoy_graph, ships_convoys, convoy_stats, convoy_edges = detect_convoys(scored)
    graph, nodes, edges = build_graph(ships_convoys, anomalies, clean["zones"])
    generate_pdf_report(ships_convoys, anomalies, quality_report)

    # ── GRAPH PIPELINE (graph theory scoring) ─────────────────────────────────
    print("\n── GRAPH PIPELINE (graph theory scoring) ──")
    graph_scored, proximity_graph, graph_metrics = compute_graph_scores(
        clean["ais"],
        anomalies,
        clean.get("alerts", pd.DataFrame()),
        clean.get("behaviors", pd.DataFrame()),
        clean["zones"],
    )

    # ── PUSH TO SUPABASE ──────────────────────────────────────────────────────
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    if not url or not key:
        print("  [Supabase] SUPABASE_URL or SUPABASE_KEY not set — skipping upload.")
    else:
        from supabase import create_client
        sb = create_client(url, key)
        print("\n── PUSHING TO SUPABASE ──")
        push_demo_pipeline(sb, ships_convoys, anomalies, clean["zones"],
                           nodes, edges, convoy_stats, convoy_edges)
        push_graph_pipeline(sb, graph_scored)

    print("\n" + "=" * 60)
    print("  Pipeline complete.")
    print("=" * 60)
