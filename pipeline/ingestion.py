"""
ingestion.py
Load AIS data, suspicious behaviors, and risk zones from CSV files.
Optionally fetch live data from AISHub API.
"""

import os
import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

# Expected file paths (relative to project root)
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
AIS_FILE       = os.path.join(DATA_DIR, "ais_data_large.csv")
BEHAVIORS_FILE = os.path.join(DATA_DIR, "suspicious_behaviors_large.csv")
ZONES_FILE     = os.path.join(DATA_DIR, "risk_zones_large.csv")


def _parse_timestamps(df: pd.DataFrame, col: str) -> pd.DataFrame:
    """Parse a timestamp column to UTC-aware datetime, coercing errors to NaT."""
    df[col] = pd.to_datetime(df[col], utc=True, errors="coerce")
    return df


def _fetch_aishub(api_key: str) -> pd.DataFrame | None:
    """
    Fetch live AIS positions from AISHub API.
    Returns a DataFrame with the same columns as ais_data_large.csv, or None on failure.
    AISHub API docs: https://www.aishub.net/api
    """
    url = "https://data.aishub.net/ws.php"
    params = {
        "username": api_key,
        "format":   "1",       # JSON
        "output":   "full",
        "compress": "0",
    }
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        payload = resp.json()
        # AISHub returns [metadata, [vessel_list]]
        if isinstance(payload, list) and len(payload) >= 2:
            vessels = payload[1]
            rows = []
            for v in vessels:
                rows.append({
                    "mmsi":                str(v.get("MMSI", "")),
                    "timestamp":           pd.Timestamp.utcnow(),
                    "latitude":            v.get("LATITUDE"),
                    "longitude":           v.get("LONGITUDE"),
                    "speed":               v.get("SOG"),
                    "course":              v.get("COG"),
                    "status":              v.get("NAME", ""),
                    "ais_active":          True,
                    "navigational_status": v.get("NAVSTAT"),
                })
            df = pd.DataFrame(rows)
            print(f"  [AISHub] Fetched {len(df)} live positions.")
            return df
    except Exception as exc:
        print(f"  [AISHub] Warning: could not fetch live data — {exc}")
    return None


def load_data() -> dict:
    """
    Load all data sources and return a dict with keys:
        ais       -> pd.DataFrame
        behaviors -> pd.DataFrame
        zones     -> pd.DataFrame

    All timestamps are UTC-aware. All MMSI columns are cast to str.
    If AISHUB_API_KEY is set in .env, live positions are appended to ais.
    """
    print("[ingestion] Loading CSV files...")

    # ── AIS data ──────────────────────────────────────────────────────────────
    ais = pd.read_csv(
        AIS_FILE,
        dtype={"mmsi": str},
        parse_dates=["timestamp"],
    )
    ais = _parse_timestamps(ais, "timestamp")
    ais["mmsi"] = ais["mmsi"].astype(str).str.strip()

    # ── Optional live AIS data from AISHub ────────────────────────────────────
    api_key = os.getenv("AISHUB_API_KEY", "").strip()
    if api_key:
        print("[ingestion] AISHUB_API_KEY found — fetching live data...")
        live = _fetch_aishub(api_key)
        if live is not None and not live.empty:
            ais = pd.concat([ais, live], ignore_index=True)
            print(f"  [ingestion] AIS DataFrame now has {len(ais)} rows after live merge.")

    # ── Suspicious behaviors ──────────────────────────────────────────────────
    behaviors = pd.read_csv(
        BEHAVIORS_FILE,
        dtype={"mmsi": str},
        parse_dates=["timestamp"],
    )
    behaviors = _parse_timestamps(behaviors, "timestamp")
    behaviors["mmsi"] = behaviors["mmsi"].astype(str).str.strip()

    # ── Risk zones ────────────────────────────────────────────────────────────
    zones = pd.read_csv(ZONES_FILE)
    # zone_id stays as-is; no MMSI column here

    print(f"[ingestion] Loaded: {len(ais)} AIS rows | "
          f"{len(behaviors)} behaviors | {len(zones)} zones")

    return {"ais": ais, "behaviors": behaviors, "zones": zones}
