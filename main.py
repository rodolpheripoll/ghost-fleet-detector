"""
main.py
Ghost Fleet Detection — Pipeline orchestrator.

SUPABASE TABLES — run these in the Supabase SQL editor before executing this script:

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
      risk_level   TEXT    DEFAULT 'Normal'
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
"""

import os
import math
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

from pipeline.ingestion       import load_data
from pipeline.cleaning        import clean_data
from pipeline.anomaly_detection import detect_anomalies
from pipeline.scoring         import compute_scores
from pipeline.knowledge_graph import build_graph
from pipeline.report_generator import generate_pdf_report


def _serialize(df: pd.DataFrame) -> list[dict]:
    """Convert a DataFrame to a list of JSON-serialisable dicts for Supabase."""
    records = df.copy()
    # Convert datetime columns to ISO strings; NaT → None
    for col in records.columns:
        if pd.api.types.is_datetime64_any_dtype(records[col]):
            records[col] = records[col].apply(
                lambda x: None if pd.isna(x) else x.isoformat()
            )
    # Replace all remaining NaN/NaT with None
    records = records.where(pd.notnull(records), None)
    # Final pass: ensure no 'NaT' strings remain
    result = records.to_dict("records")
    for row in result:
        for k, v in row.items():
            if v == "NaT" or v == "nan":
                row[k] = None
    return result


def push_to_supabase(
    scored: pd.DataFrame,
    anomalies: pd.DataFrame,
    zones: pd.DataFrame,
    nodes: pd.DataFrame,
    edges: pd.DataFrame,
) -> None:
    """Push all pipeline outputs to Supabase tables."""
    from supabase import create_client

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    if not url or not key:
        print("  [Supabase] SUPABASE_URL or SUPABASE_KEY not set — skipping upload.")
        return

    supabase = create_client(url, key)

    # ── ships (one row per unique MMSI — latest position) ────────────────────
    ships_cols = [
        "mmsi", "timestamp", "latitude", "longitude",
        "speed", "course", "status", "ais_active", "score", "risk_level",
    ]
    available  = [c for c in ships_cols if c in scored.columns]
    ships_data = (
        scored[available]
        .sort_values("timestamp")
        .drop_duplicates("mmsi", keep="last")
    )
    supabase.table("ships").upsert(_serialize(ships_data)).execute()
    print(f"  [Supabase] ships        -> {len(ships_data)} rows upserted")

    # ── anomalies ─────────────────────────────────────────────────────────────
    if not anomalies.empty:
        supabase.table("anomalies").insert(_serialize(anomalies)).execute()
        print(f"  [Supabase] anomalies    -> {len(anomalies)} rows inserted")

    # ── risk_zones ────────────────────────────────────────────────────────────
    zone_cols = ["zone_id", "name", "lat_min", "lat_max",
                 "lon_min", "lon_max", "risk_level", "description"]
    avail_z   = [c for c in zone_cols if c in zones.columns]
    supabase.table("risk_zones").upsert(_serialize(zones[avail_z])).execute()
    print(f"  [Supabase] risk_zones   -> {len(zones)} rows upserted")

    # ── graph_nodes ───────────────────────────────────────────────────────────
    if not nodes.empty:
        supabase.table("graph_nodes").upsert(_serialize(nodes)).execute()
        print(f"  [Supabase] graph_nodes  -> {len(nodes)} rows upserted")

    # ── graph_edges ───────────────────────────────────────────────────────────
    if not edges.empty:
        supabase.table("graph_edges").insert(_serialize(edges)).execute()
        print(f"  [Supabase] graph_edges  -> {len(edges)} rows inserted")

    print("  [Supabase] All data pushed successfully.")


if __name__ == "__main__":
    print("=" * 60)
    print("  Ghost Fleet Detection Pipeline")
    print("=" * 60)

    # 1. Ingest
    data = load_data()

    # 2. Clean
    clean, quality_report = clean_data(data)

    # 3. Detect anomalies (rule + ML + pre-labeled behaviors/alerts)
    anomalies = detect_anomalies(
        clean["ais"], clean["zones"],
        behaviors_df=clean.get("behaviors"),
        alerts_df=clean.get("alerts"),
    )

    # 4. Score ships
    scored = compute_scores(clean["ais"], anomalies, clean["zones"])

    # 5. Build knowledge graph
    graph, nodes, edges = build_graph(scored, anomalies, clean["zones"])

    # 6. Generate PDF report
    generate_pdf_report(scored, anomalies, quality_report)

    # 7. Push to Supabase
    push_to_supabase(scored, anomalies, clean["zones"], nodes, edges)

    print("=" * 60)
    print("  Pipeline complete.")
    print("=" * 60)
