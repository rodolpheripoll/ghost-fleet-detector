"""
cleaning.py
Validate, normalize, and clean raw AIS data.
Returns cleaned DataFrames and a data-quality report.
"""

import re
import pandas as pd

# MMSI validation: 9 digits OR starts with "FAKE-"
_MMSI_RE = re.compile(r"^\d{9}$|^FAKE-")

# Coerce ais_active to bool
_TRUTHY  = {"true", "1", "yes"}
_FALSY   = {"false", "0", "no"}


def _normalize_ais_active(series: pd.Series) -> pd.Series:
    """Convert mixed-type ais_active column to boolean (NaN -> False)."""
    def _cast(v):
        if isinstance(v, bool):
            return v
        s = str(v).strip().lower()
        if s in _TRUTHY:
            return True
        if s in _FALSY:
            return False
        return False  # unknown values treated as inactive

    return series.map(_cast)


def clean_data(data: dict) -> tuple[dict, dict]:
    """
    Clean and validate the raw data produced by ingestion.load_data().

    Parameters
    ----------
    data : dict with keys 'ais', 'behaviors', 'zones'

    Returns
    -------
    cleaned : dict with keys 'ais', 'behaviors', 'zones'
    quality_report : dict
        total_rows              : original AIS row count
        duplicates_removed      : exact duplicate rows dropped
        invalid_coords_removed  : rows with out-of-range lat/lon dropped
        invalid_mmsi_count      : rows with non-standard MMSI (kept but flagged)
        rows_after_cleaning     : final AIS row count
    """
    print("[cleaning] Starting data cleaning...")

    ais       = data["ais"].copy()
    behaviors = data["behaviors"].copy()
    zones     = data["zones"].copy()
    ships     = data.get("ships", pd.DataFrame()).copy()
    alerts    = data.get("alerts", pd.DataFrame()).copy()

    total_rows = len(ais)

    # ── 1. Drop exact duplicates ───────────────────────────────────────────────
    before = len(ais)
    ais = ais.drop_duplicates()
    duplicates_removed = before - len(ais)
    print(f"  Duplicates removed : {duplicates_removed}")

    # ── 2. Validate coordinates ───────────────────────────────────────────────
    # Latitude must be -90 … 90; longitude must be -180 … 180.
    before = len(ais)
    valid_lat = ais["latitude"].between(-90, 90, inclusive="both")
    valid_lon = ais["longitude"].between(-180, 180, inclusive="both")
    ais = ais[valid_lat & valid_lon].copy()
    invalid_coords_removed = before - len(ais)
    print(f"  Invalid coords removed : {invalid_coords_removed}")

    # ── 3. Validate MMSI format ───────────────────────────────────────────────
    # Standard MMSI: exactly 9 digits. We also allow FAKE- prefixes (test data).
    ais["mmsi_valid"] = ais["mmsi"].astype(str).str.match(_MMSI_RE)
    invalid_mmsi_count = int((~ais["mmsi_valid"]).sum())
    print(f"  Non-standard MMSI flagged : {invalid_mmsi_count} (kept)")

    # ── 4. Normalize ais_active → boolean ────────────────────────────────────
    ais["ais_active"] = _normalize_ais_active(ais["ais_active"])

    # ── 5. Fill missing numeric fields ───────────────────────────────────────
    ais["speed"]  = pd.to_numeric(ais["speed"],  errors="coerce").fillna(0.0)
    ais["course"] = pd.to_numeric(ais["course"], errors="coerce")  # NaN kept

    # ── 6. Ensure latitude/longitude are float ───────────────────────────────
    ais["latitude"]  = ais["latitude"].astype(float)
    ais["longitude"] = ais["longitude"].astype(float)

    # ── 7. Fill / coerce navigational_status ─────────────────────────────────
    if "navigational_status" in ais.columns:
        ais["navigational_status"] = ais["navigational_status"].fillna("unknown")

    # ── 8. Clean behaviors (drop rows without MMSI) ───────────────────────────
    behaviors = behaviors.dropna(subset=["mmsi"])
    behaviors["mmsi"] = behaviors["mmsi"].astype(str).str.strip()

    # ── 9. Parse zone coordinates (lat_min,lon_min;lat_max,lon_max) ───────────
    def _parse_bbox(coord_str):
        try:
            parts      = str(coord_str).replace(" ", "").split(";")
            lat1, lon1 = map(float, parts[0].split(","))
            lat2, lon2 = map(float, parts[1].split(","))
            return (
                min(lat1, lat2), max(lat1, lat2),
                min(lon1, lon2), max(lon1, lon2),
            )
        except Exception:
            return (None, None, None, None)

    if "coordinates" in zones.columns:
        bbox = zones["coordinates"].apply(_parse_bbox)
        zones[["lat_min", "lat_max", "lon_min", "lon_max"]] = pd.DataFrame(
            bbox.tolist(), index=zones.index
        )

    rows_after = len(ais)
    print(f"[cleaning] Done. {rows_after} AIS rows remaining (from {total_rows}).")

    quality_report = {
        "total_rows":             total_rows,
        "duplicates_removed":     duplicates_removed,
        "invalid_coords_removed": invalid_coords_removed,
        "invalid_mmsi_count":     invalid_mmsi_count,
        "rows_after_cleaning":    rows_after,
    }

    cleaned = {"ais": ais, "behaviors": behaviors, "zones": zones,
               "ships": ships, "alerts": alerts}
    return cleaned, quality_report
