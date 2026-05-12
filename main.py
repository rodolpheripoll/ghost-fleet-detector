"""
main.py
Ghost Fleet Detection — Pipeline orchestrator.
Runs DEMO pipeline (rules + IF) and GRAPH pipeline (graph theory).
"""

import os
import math
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

from pipeline.ingestion         import load_data
from pipeline.cleaning          import clean_data
from pipeline.anomaly_detection import detect_anomalies
from pipeline.scoring           import compute_scores, compute_zone_stats
from pipeline.graph_scoring     import compute_graph_scores
from pipeline.convoy_detection  import detect_convoys
from pipeline.knowledge_graph   import build_graph
from pipeline.report_generator  import generate_pdf_report


def _serialize(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to JSON-serialisable dicts for Supabase."""
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
            elif isinstance(v, float):
                if math.isnan(v) or math.isinf(v):
                    row[k] = None
                elif v == int(v):
                    row[k] = int(v)
    return result


def _enrich_with_registry(ships_df: pd.DataFrame, registry: pd.DataFrame) -> pd.DataFrame:
    """
    Left-join ship registry (ships_large) to enrich ships with name/type/flag.
    Ships with FAKE- MMSI get flag='FAKE', name='UNKNOWN', type='Unknown'.
    Ships not in the registry (live-only MMSIs) get fillna defaults.
    """
    if registry is None or registry.empty:
        ships_df["ship_name"] = "UNKNOWN"
        ships_df["ship_type"] = "Unknown"
        ships_df["flag"]      = "Unknown"
        return ships_df

    reg = registry[["mmsi", "name", "type", "flag"]].copy()
    reg.columns = ["mmsi", "ship_name", "ship_type", "flag"]
    reg["mmsi"] = reg["mmsi"].astype(str)

    result = ships_df.copy()
    result["mmsi"] = result["mmsi"].astype(str)
    result = result.merge(reg, on="mmsi", how="left")

    result["ship_name"] = result["ship_name"].fillna("UNKNOWN")
    result["ship_type"] = result["ship_type"].fillna("Unknown")
    result["flag"]      = result["flag"].fillna("Unknown")

    # FAKE- MMSIs have no real registry entry
    fake_mask = result["mmsi"].str.startswith("FAKE-")
    result.loc[fake_mask, "flag"]      = "FAKE"
    result.loc[fake_mask, "ship_name"] = "UNKNOWN"

    return result


def push_demo_pipeline(supabase, scored, anomalies, zones, nodes, edges,
                       convoy_stats, convoy_edges, alerts_df=None, behaviors_df=None):
    """Push DEMO pipeline results to Supabase."""
    ships_cols = [
        "mmsi", "timestamp", "latitude", "longitude",
        "speed", "course", "status", "ais_active",
        "score", "risk_level", "prior_risk_score",
        "convoy_id", "convoy_size", "convoy_risk",
        "ship_name", "ship_type", "flag", "hour_of_day", "is_in_risk_zone",
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
        # DELETE before INSERT to prevent accumulation across pipeline runs
        supabase.table("anomalies").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("anomalies").insert(_serialize(anomalies)).execute()
        print(f"  [Supabase] anomalies     -> {len(anomalies)} rows inserted (table cleared first)")

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

    # Alerts from CSV (pre-labelled)
    if alerts_df is not None and not alerts_df.empty:
        alert_cols = ["alert_id", "mmsi", "type", "description",
                      "timestamp", "severity", "status", "assigned_to", "resolution"]
        avail_a = [c for c in alert_cols if c in alerts_df.columns]
        supabase.table("alerts").upsert(_serialize(alerts_df[avail_a])).execute()
        print(f"  [Supabase] alerts        -> {len(alerts_df)} rows upserted")

    # Q9 — Zone stats
    beh_df = behaviors_df if behaviors_df is not None else pd.DataFrame()
    zone_stats_df = compute_zone_stats(scored, beh_df, zones)
    if not zone_stats_df.empty:
        supabase.table("zone_stats").upsert(_serialize(zone_stats_df)).execute()
        print(f"  [Supabase] zone_stats    -> {len(zone_stats_df)} rows upserted")

    print("  [Supabase] DEMO pipeline pushed successfully.")


def push_graph_pipeline(supabase, graph_scored):
    """Push GRAPH pipeline results to Supabase (table: ships_graph)."""
    graph_cols = [
        "mmsi", "timestamp", "latitude", "longitude",
        "speed", "course", "status", "ais_active",
        "score", "risk_level",
        "demo_score", "group_discount", "is_isolated",
        "convoy_id", "convoy_size", "zone_score",
        "flag", "ship_type", "hour_of_day", "is_in_risk_zone",
    ]
    available  = [c for c in graph_cols if c in graph_scored.columns]
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

    # ── DEMO PIPELINE ─────────────────────────────────────────────────────────
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

    # Enrich with registry (name / type / flag)
    ships_convoys = _enrich_with_registry(ships_convoys, clean.get("ships"))

    graph, nodes, edges = build_graph(ships_convoys, anomalies, clean["zones"])
    generate_pdf_report(ships_convoys, anomalies, quality_report)

    # ── GRAPH PIPELINE (group-membership refinement of DEMO scores) ──────────
    print("\n── GRAPH PIPELINE (H3 group refinement) ──")
    graph_scored, graph_metrics = compute_graph_scores(
        ships_convoys,   # ais_df with convoy_id / convoy_size from H3 detection
        scored,          # DEMO scores as baseline
        convoy_stats,    # H3 convoy stats (for API compatibility)
        zones_df=clean["zones"],
    )

    # ── Merge ship metadata (flag, type) for enriched frontend charts ─────────
    ships_meta = clean.get("ships")
    if ships_meta is not None and not ships_meta.empty:
        meta_cols = [c for c in ["mmsi", "flag", "type"] if c in ships_meta.columns]
        meta = ships_meta[meta_cols].copy()
        meta["mmsi"] = meta["mmsi"].astype(str)
        if "type" in meta.columns:
            meta = meta.rename(columns={"type": "ship_type"})
        for df_obj in [ships_convoys, graph_scored]:
            df_obj["mmsi"] = df_obj["mmsi"].astype(str)
        ships_convoys = ships_convoys.merge(meta, on="mmsi", how="left")
        graph_scored  = graph_scored.merge(meta, on="mmsi", how="left")

    # ── PUSH TO SUPABASE ──────────────────────────────────────────────────────
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    if not url or not key:
        print("  [Supabase] SUPABASE_URL or SUPABASE_KEY not set — skipping upload.")
    else:
        from supabase import create_client
        sb = create_client(url, key)
        print("\n── PUSHING TO SUPABASE ──")
        push_demo_pipeline(
            sb, ships_convoys, anomalies, clean["zones"],
            nodes, edges, convoy_stats, convoy_edges,
            alerts_df=clean.get("alerts"),
            behaviors_df=clean.get("behaviors"),
        )
        push_graph_pipeline(sb, graph_scored)

    print("\n" + "=" * 60)
    print("  Pipeline complete.")
    print("=" * 60)
