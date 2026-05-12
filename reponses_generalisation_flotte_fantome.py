"""
reponses_generalisation_flotte_fantome.py
==========================================
Livrable hackathon — Generalisation Sujet 4 : Detection activites maritimes anormales.

Ce fichier charge les donnees brutes et repond aux questions Q2 et Q9 du sujet.
Lancer depuis la racine du projet V4/ :
    python3 reponses_generalisation_flotte_fantome.py
"""

import os
import sys
import pandas as pd

# ── Localisation des donnees ──────────────────────────────────────────────────
_BASE = os.path.dirname(os.path.abspath(__file__))
_DATA_DIRS = [
    os.path.join(_BASE, "data"),
    os.path.join(
        _BASE, "..",
        "corection_codex", "HackathonAlbert2026-main",
        "SujetsHackathon2026", "Sujet4", "Generalisation",
    ),
]


def _find_data_dir() -> str:
    for d in _DATA_DIRS:
        if os.path.isdir(d):
            csvs = [f for f in os.listdir(d) if f.endswith(".csv")]
            if csvs:
                return d
    sys.exit("[ERROR] Aucun dossier de donnees trouve. "
             "Placez les CSV dans V4/data/ ou verifiez le chemin Generalisation/.")


def _load(data_dir: str, filename: str) -> pd.DataFrame:
    path = os.path.join(data_dir, filename)
    if not os.path.isfile(path):
        print(f"  [WARN] Fichier absent : {path}")
        return pd.DataFrame()
    df = pd.read_csv(path, low_memory=False)
    print(f"  Charge {len(df):>6} lignes depuis {filename}")
    return df


# ═══════════════════════════════════════════════════════════════════════════════
#  Q2 — Normalisation du statut AIS et distribution horaire
# ═══════════════════════════════════════════════════════════════════════════════

# Carte de normalisation : valeurs brutes → 3 categories canoniques
_STATUS_MAP = {
    # At Anchor
    "at anchor":                  "At Anchor",
    "anchor":                     "At Anchor",
    "not under command":          "At Anchor",
    "not under command (nuc)":    "At Anchor",
    # Moored
    "moored":                     "Moored",
    "secured":                    "Moored",
    "alongside":                  "Moored",
    # Under Way (toutes les autres valeurs tombent ici par defaut)
    "under way using engine":     "Under Way",
    "under way sailing":          "Under Way",
    "under way":                  "Under Way",
    "constrained by her draught": "Under Way",
    "restricted manoeuvrability": "Under Way",
    "engaged in fishing":         "Under Way",
    "engaged in dredging":        "Under Way",
    "aground":                    "Under Way",
}


def normalize_status(series: pd.Series) -> pd.Series:
    """
    Normalise les valeurs brutes du champ 'status' AIS vers trois categories :
        - 'At Anchor'  : navire a l'ancre ou hors controle
        - 'Moored'     : navire amarres a un poste fixe
        - 'Under Way'  : navire en mouvement ou situation inconnue (defaut)

    Parametres
    ----------
    series : pd.Series  valeurs brutes (str, eventuellement NaN)

    Retour
    ------
    pd.Series  avec uniquement les trois valeurs canoniques
    """
    return (
        series.fillna("unknown")
              .astype(str)
              .str.strip()
              .str.lower()
              .map(lambda v: _STATUS_MAP.get(v, "Under Way"))
    )


def q2_status_and_hour(ais: pd.DataFrame) -> pd.DataFrame:
    """
    Q2 — Deux enrichissements appliques sur le DataFrame AIS :

    1. Normalisation du champ 'status' → 3 valeurs (At Anchor / Moored / Under Way)
    2. Ajout de la colonne 'hour_of_day' (entier 0-23, heure UTC)

    Retourne le DataFrame enrichi et affiche les distributions.
    """
    print("\n" + "=" * 60)
    print("  Q2 — Normalisation status et distribution horaire")
    print("=" * 60)

    ais = ais.copy()

    # ── 1. Normalisation du statut ────────────────────────────────────────────
    if "status" in ais.columns:
        raw_values = ais["status"].astype(str).str.strip().str.lower().unique()
        print(f"\n  Valeurs brutes distinctes de 'status' ({len(raw_values)}) :")
        for v in sorted(raw_values):
            print(f"    '{v}'")

        ais["status"] = normalize_status(ais["status"])

        status_dist = ais["status"].value_counts()
        print(f"\n  Distribution apres normalisation ({len(ais)} lignes) :")
        for cat, cnt in status_dist.items():
            pct = 100 * cnt / len(ais)
            print(f"    {cat:<15} : {cnt:>6}  ({pct:.1f} %)")
    else:
        print("  [WARN] Colonne 'status' absente.")

    # ── 2. Heure UTC (hour_of_day) ────────────────────────────────────────────
    if "timestamp" in ais.columns:
        hours = pd.to_datetime(ais["timestamp"], utc=True, errors="coerce").dt.hour
        ais["hour_of_day"] = hours.apply(lambda x: int(x) if pd.notna(x) else None)

        hour_dist = (
            ais["hour_of_day"]
            .dropna()
            .astype(int)
            .value_counts()
            .sort_index()
        )
        print(f"\n  Distribution des positions AIS par heure UTC :")
        print(f"  {'Heure':>5}  {'Positions':>9}")
        for h, cnt in hour_dist.items():
            bar = "#" * (cnt * 30 // hour_dist.max())
            print(f"  {h:>5}h  {cnt:>9}  {bar}")

        # Heures de pointe / creuses
        peak_hour  = int(hour_dist.idxmax())
        quiet_hour = int(hour_dist.idxmin())
        print(f"\n  Heure de pointe  : {peak_hour}h  ({hour_dist[peak_hour]} positions)")
        print(f"  Heure la plus calme : {quiet_hour}h  ({hour_dist[quiet_hour]} positions)")
        print("\n  Interpretation :")
        print("  - Les pics d'activite en heures ouvrables (8h-18h) sont attendus.")
        print("  - Une surrepresentation nocturne (22h-4h) est un signal de flotte fantome")
        print("    car les operations de transbordement illicite ont lieu de nuit pour")
        print("    eviter la surveillance aerienne et satellitaire.")
    else:
        print("  [WARN] Colonne 'timestamp' absente — hour_of_day non calculable.")

    return ais


# ═══════════════════════════════════════════════════════════════════════════════
#  Q9 — Statistiques par zone de risque
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_bbox(coord_str: str):
    """Parse 'lat1,lon1;lat2,lon2' → (lat_min, lat_max, lon_min, lon_max)."""
    try:
        parts = str(coord_str).replace(" ", "").split(";")
        lat1, lon1 = map(float, parts[0].split(","))
        lat2, lon2 = map(float, parts[1].split(","))
        return (min(lat1, lat2), max(lat1, lat2), min(lon1, lon2), max(lon1, lon2))
    except Exception:
        return (None, None, None, None)


def q9_zone_stats(ais: pd.DataFrame, behaviors: pd.DataFrame, zones: pd.DataFrame) -> pd.DataFrame:
    """
    Q9 — Statistiques par zone de risque geographique.

    Pour chaque zone (bounding box definie par lat_min/lat_max/lon_min/lon_max) :
      - ship_count      : nombre de MMSIs uniques dont la derniere position se trouve
                          dans la zone
      - behavior_count  : nombre de comportements suspects (behaviors_df) associes
                          a des navires presents dans la zone
      - critical_count  : nombre de navires avec score >= 0.5 dans la zone
                          (si colonne 'score' disponible)

    Resultats tries par behavior_count decroissant.

    Retourne un DataFrame et affiche les resultats.
    """
    print("\n" + "=" * 60)
    print("  Q9 — Statistiques par zone de risque")
    print("=" * 60)

    if zones.empty:
        print("  [WARN] Aucune zone chargee.")
        return pd.DataFrame()

    # Parse coordonnees si necessaire
    if "lat_min" not in zones.columns and "coordinates" in zones.columns:
        bbox = zones["coordinates"].apply(_parse_bbox)
        zones = zones.copy()
        zones[["lat_min", "lat_max", "lon_min", "lon_max"]] = pd.DataFrame(
            bbox.tolist(), index=zones.index
        )

    # Derniere position connue par navire
    ais = ais.copy()
    ais["mmsi"] = ais["mmsi"].astype(str)
    if "timestamp" in ais.columns:
        ais = ais.sort_values("timestamp")
    last_pos = ais.drop_duplicates("mmsi", keep="last")

    beh = behaviors.copy()
    if not beh.empty and "mmsi" in beh.columns:
        beh["mmsi"] = beh["mmsi"].astype(str)

    records = []
    for _, zone in zones.iterrows():
        lat_min = zone.get("lat_min")
        lat_max = zone.get("lat_max")
        lon_min = zone.get("lon_min")
        lon_max = zone.get("lon_max")
        if any(v is None or pd.isna(v) for v in [lat_min, lat_max, lon_min, lon_max]):
            continue

        in_zone = last_pos[
            last_pos["latitude"].between(lat_min, lat_max) &
            last_pos["longitude"].between(lon_min, lon_max)
        ]
        mmsis = set(in_zone["mmsi"].unique())

        ship_count    = len(mmsis)
        behav_count   = int(beh["mmsi"].isin(mmsis).sum()) if not beh.empty and "mmsi" in beh.columns else 0
        critical_count = 0
        if "score" in in_zone.columns:
            critical_count = int((pd.to_numeric(in_zone["score"], errors="coerce") >= 0.5).sum())

        records.append({
            "zone_id":        str(zone.get("zone_id", "")),
            "name":           str(zone.get("name", "")),
            "risk_level":     str(zone.get("risk_level", "")),
            "ship_count":     ship_count,
            "behavior_count": behav_count,
            "critical_count": critical_count,
        })

    result = (
        pd.DataFrame(records)
        .sort_values("behavior_count", ascending=False)
        .reset_index(drop=True)
    )

    print(f"\n  {len(result)} zones analysees. Top 10 par nombre de comportements suspects :\n")
    print(f"  {'#':>3}  {'Zone':<35}  {'Risque':<12}  {'Navires':>7}  {'Comport.':>8}  {'Critiques':>9}")
    print("  " + "-" * 80)
    for i, row in result.head(10).iterrows():
        print(
            f"  {i+1:>3}  {row['name']:<35}  {row['risk_level']:<12}"
            f"  {row['ship_count']:>7}  {row['behavior_count']:>8}  {row['critical_count']:>9}"
        )

    if not result.empty:
        top = result.iloc[0]
        print(f"\n  Zone la plus a risque (comportements) :")
        print(f"    Nom        : {top['name']}")
        print(f"    Niveau     : {top['risk_level']}")
        print(f"    Navires    : {top['ship_count']}")
        print(f"    Comport.   : {top['behavior_count']}")
        print(f"    Critiques  : {top['critical_count']}")
        print("\n  Interpretation :")
        print("  - Une zone concentrant a la fois de nombreux navires ET de nombreux")
        print("    comportements suspects indique un point chaud de transbordement illicite.")
        print("  - Ces zones doivent faire l'objet d'une surveillance renforcee et")
        print("    de requetes d'identification aupres des autorites de l'Etat du pavillon.")

    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  Point d'entree principal
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("  Ghost Fleet — Reponses Generalisation (Q2 & Q9)")
    print("=" * 60)

    data_dir = _find_data_dir()
    print(f"\n  Dossier de donnees : {data_dir}\n")

    ais       = _load(data_dir, "ais_data_large.csv")
    behaviors = _load(data_dir, "suspicious_behaviors_large.csv")
    zones     = _load(data_dir, "risk_zones_large.csv")

    if ais.empty:
        sys.exit("[ERROR] ais_data_large.csv introuvable ou vide.")

    # ── Q2 ────────────────────────────────────────────────────────────────────
    ais_enriched = q2_status_and_hour(ais)

    # ── Q9 ────────────────────────────────────────────────────────────────────
    zone_stats = q9_zone_stats(ais_enriched, behaviors, zones)

    print("\n" + "=" * 60)
    print("  Termine.")
    print("=" * 60)
