"""
ingestion.py
Load AIS data, suspicious behaviors, and risk zones from CSV files.
Optionally fetch live data from aisstream.io via WebSocket.
"""

import os
import json
import asyncio
import pandas as pd

try:
    import websockets
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False

from dotenv import load_dotenv

load_dotenv()

# Expected file paths — look for data in two places:
#  1. <project_root>/data/  (symlink or copy)
#  2. The hackathon repo's Généralisation folder (absolute fallback)
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_LOCAL_DATA   = os.path.join(_PROJECT_ROOT, "data")
_HACKATHON_DATA = os.path.join(
    _PROJECT_ROOT, "..", "HackathonAlbert2026-main",
    "SujetsHackathon2026", "Sujet4", "Généralisation"
)
DATA_DIR = _LOCAL_DATA if os.path.isdir(_LOCAL_DATA) else os.path.normpath(_HACKATHON_DATA)

AIS_FILE       = os.path.join(DATA_DIR, "ais_data_large.csv")
BEHAVIORS_FILE = os.path.join(DATA_DIR, "suspicious_behaviors_large.csv")
ZONES_FILE     = os.path.join(DATA_DIR, "risk_zones_large.csv")
SHIPS_FILE     = os.path.join(DATA_DIR, "ships_large.csv")
ALERTS_FILE    = os.path.join(DATA_DIR, "alerts_large.csv")


def _parse_timestamps(df: pd.DataFrame, col: str) -> pd.DataFrame:
    """Parse a timestamp column to UTC-aware datetime, coercing errors to NaT."""
    df[col] = pd.to_datetime(df[col], utc=True, errors="coerce")
    return df


async def _fetch_aisstream(api_key: str, limit: int = 500) -> pd.DataFrame:
    """
    Fetch live AIS data from aisstream.io via WebSocket.
    Returns a DataFrame with the same columns as the CSV data.

    aisstream.io provides a free worldwide real-time AIS WebSocket stream.
    Source: https://aisstream.io — free tier allows up to 1000 vessels/minute.

    Protocol:
      1. Connect to wss://stream.aisstream.io/v0/stream
      2. Send a subscribe message with APIKey + BoundingBoxes + FilterMessageTypes
      3. Receive PositionReport messages until `limit` is reached or timeout
    """
    if not WEBSOCKETS_AVAILABLE:
        print("  [aisstream] websockets package not installed — skipping live data.")
        return pd.DataFrame()

    url = "wss://stream.aisstream.io/v0/stream"

    subscribe_message = {
        "APIKey": api_key,
        "BoundingBoxes": [
            [[-90, -180], [90, 180]]   # worldwide coverage
        ],
        "FilterMessageTypes": ["PositionReport"],
    }

    records = []
    print(f"  [aisstream] Connecting to {url}...")
    try:
        async with websockets.connect(url) as ws:
            await ws.send(json.dumps(subscribe_message))
            print(f"  [aisstream] Subscribed — collecting up to {limit} positions...")
            while len(records) < limit:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=30)
                except asyncio.TimeoutError:
                    print("  [aisstream] Timeout waiting for messages.")
                    break
                data = json.loads(raw)
                if "Message" in data and "PositionReport" in data["Message"]:
                    report = data["Message"]["PositionReport"]
                    records.append({
                        "mmsi":                str(data["MetaData"]["MMSI"]),
                        "timestamp":           data["MetaData"]["time_utc"],
                        "latitude":            report["Latitude"],
                        "longitude":           report["Longitude"],
                        "speed":               report["Sog"],
                        "course":              report["Cog"],
                        "status":              str(report.get("NavigationalStatus", "")),
                        "ais_active":          True,
                        "navigational_status": report.get("NavigationalStatus", 0),
                    })
    except Exception as exc:
        print(f"  [aisstream] Error: {exc}")
        return pd.DataFrame()

    df = pd.DataFrame(records)
    print(f"  [aisstream] Fetched {len(df)} live positions.")
    return df


def _run_aisstream(api_key: str, limit: int = 500) -> pd.DataFrame:
    """Synchronous wrapper around the async aisstream fetch."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop.run_until_complete(_fetch_aisstream(api_key, limit))
    except Exception as exc:
        print(f"  [aisstream] Could not run event loop: {exc}")
        return pd.DataFrame()


def load_data() -> dict:
    """
    Load all data sources and return a dict with keys:
        ais       -> pd.DataFrame  (AIS positions)
        behaviors -> pd.DataFrame  (suspicious_behaviors_large)
        zones     -> pd.DataFrame  (risk_zones_large)
        ships     -> pd.DataFrame  (ships_large metadata, may be empty)
        alerts    -> pd.DataFrame  (alerts_large, may be empty)

    All timestamps are UTC-aware. All MMSI columns are cast to str.
    If AISSTREAM_API_KEY is set in .env, live positions are appended to ais.
    Source for live data: aisstream.io free WebSocket AIS stream.
    """
    print(f"[ingestion] Data directory: {DATA_DIR}")
    print("[ingestion] Loading CSV files...")

    # ── AIS data ──────────────────────────────────────────────────────────────
    ais = pd.read_csv(AIS_FILE, dtype={"mmsi": str}, parse_dates=["timestamp"])
    ais = _parse_timestamps(ais, "timestamp")
    ais["mmsi"] = ais["mmsi"].astype(str).str.strip()
    print(f"  AIS: {ais.shape} | columns: {list(ais.columns)}")

    # ── Optional live AIS data from aisstream.io ──────────────────────────────
    api_key = os.getenv("AISSTREAM_API_KEY", "").strip()
    if api_key:
        print("[ingestion] AISSTREAM_API_KEY found — fetching live data from aisstream.io...")
        live = _run_aisstream(api_key, limit=500)
        if not live.empty:
            live = _parse_timestamps(live, "timestamp")
            live["mmsi"] = live["mmsi"].astype(str).str.strip()
            ais = pd.concat([ais, live], ignore_index=True)
            print(f"  [ingestion] AIS DataFrame now has {len(ais)} rows after live merge.")
    else:
        print("[ingestion] No AISSTREAM_API_KEY — using CSV data only.")

    # ── Suspicious behaviors ──────────────────────────────────────────────────
    behaviors = pd.read_csv(BEHAVIORS_FILE, dtype={"mmsi": str}, parse_dates=["timestamp"])
    behaviors = _parse_timestamps(behaviors, "timestamp")
    behaviors["mmsi"] = behaviors["mmsi"].astype(str).str.strip()
    print(f"  Behaviors: {behaviors.shape} | columns: {list(behaviors.columns)}")

    # ── Risk zones ────────────────────────────────────────────────────────────
    zones = pd.read_csv(ZONES_FILE)
    print(f"  Zones: {zones.shape} | columns: {list(zones.columns)}")

    # ── Ships metadata (optional enrichment) ─────────────────────────────────
    ships = pd.DataFrame()
    if os.path.exists(SHIPS_FILE):
        ships = pd.read_csv(SHIPS_FILE, dtype={"mmsi": str})
        ships["mmsi"] = ships["mmsi"].astype(str).str.strip()
        print(f"  Ships: {ships.shape} | columns: {list(ships.columns)}")
    else:
        print("  Ships file not found — skipping enrichment.")

    # ── Alerts (optional) ────────────────────────────────────────────────────
    alerts = pd.DataFrame()
    if os.path.exists(ALERTS_FILE):
        alerts = pd.read_csv(ALERTS_FILE, dtype={"mmsi": str}, parse_dates=["timestamp"])
        alerts = _parse_timestamps(alerts, "timestamp")
        alerts["mmsi"] = alerts["mmsi"].astype(str).str.strip()
        print(f"  Alerts: {alerts.shape} | columns: {list(alerts.columns)}")
    else:
        print("  Alerts file not found — skipping.")

    print(f"[ingestion] Loaded: {len(ais)} AIS rows | "
          f"{len(behaviors)} behaviors | {len(zones)} zones | "
          f"{len(ships)} ships metadata | {len(alerts)} alerts")

    return {"ais": ais, "behaviors": behaviors, "zones": zones,
            "ships": ships, "alerts": alerts}
