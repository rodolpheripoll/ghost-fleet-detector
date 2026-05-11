"""
report_generator.py
Generate a 3-page PDF executive report using fpdf2.
"""

import os
import pandas as pd
from fpdf import FPDF, XPos, YPos

OUTPUT_DIR  = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "outputs"
)
REPORT_PATH = os.path.join(OUTPUT_DIR, "rapport_flotte_fantome.pdf")

# Risk-level colour palette (R, G, B)
RISK_COLORS = {
    "Ghost Fleet": (139,  0,  0),
    "Critical":    (220, 38, 38),
    "Suspect":     (234,179, 8),
    "Normal":      ( 34,197, 94),
}


class GhostFleetPDF(FPDF):
    """Custom FPDF subclass with header and footer."""

    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_fill_color(15, 23, 42)   # Navy #0f172a
        self.set_text_color(255, 255, 255)
        self.cell(0, 10, "  Ghost Fleet Detection — Rapport Confidentiel",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
        self.ln(4)
        self.set_text_color(0, 0, 0)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 10, f"Page {self.page_no()} / {{nb}}", align="C")

    def section_title(self, title: str):
        self.set_font("Helvetica", "B", 13)
        self.set_fill_color(30, 41, 59)
        self.set_text_color(255, 255, 255)
        self.cell(0, 9, f"  {title}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
        self.ln(3)
        self.set_text_color(0, 0, 0)

    def kpi_row(self, label: str, value, color=(0, 0, 0)):
        self.set_font("Helvetica", "", 11)
        self.cell(90, 8, label)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*color)
        self.cell(0, 8, str(value), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(0, 0, 0)


def _safe_str(v) -> str:
    if pd.isna(v):
        return "N/A"
    return str(v)


def generate_pdf_report(
    ais_df: pd.DataFrame,
    anomalies_df: pd.DataFrame,
    quality_report: dict,
) -> str:
    """
    Generate a 3-page PDF report and save it to outputs/rapport_flotte_fantome.pdf.

    Parameters
    ----------
    ais_df         : scored AIS DataFrame (must have 'score' and 'risk_level' columns)
    anomalies_df   : anomalies DataFrame
    quality_report : dict produced by cleaning.clean_data()

    Returns
    -------
    str : absolute path to the generated PDF
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("[report_generator] Generating PDF report...")

    # Pre-compute aggregates
    unique_ships = ais_df.drop_duplicates("mmsi") if not ais_df.empty else pd.DataFrame()
    total_ships   = len(unique_ships)
    suspicious    = int((unique_ships["score"] > 0.3).sum()) if not unique_ships.empty else 0
    critical      = int((unique_ships["score"] > 0.6).sum()) if not unique_ships.empty else 0
    ghost_fleet   = int((unique_ships["score"] >= 0.8).sum()) if not unique_ships.empty else 0
    total_anom    = len(anomalies_df)

    rule_anom = ml_anom = 0
    if not anomalies_df.empty:
        rule_anom = int(anomalies_df["detected_by"].isin(["rule", "both"]).sum())
        ml_anom   = int(anomalies_df["detected_by"].isin(["isolation_forest", "both"]).sum())

    type_counts: pd.Series = (
        anomalies_df["type"].value_counts()
        if not anomalies_df.empty
        else pd.Series(dtype=int)
    )

    # Top 10 most suspicious ships
    if not unique_ships.empty:
        top10 = unique_ships.sort_values("score", ascending=False).head(10).copy()
        # Join anomaly types
        if not anomalies_df.empty:
            anom_types = (
                anomalies_df.groupby("mmsi")["type"]
                .apply(lambda s: ", ".join(s.unique()))
                .reset_index()
            )
            top10 = top10.merge(anom_types, on="mmsi", how="left")
        else:
            top10["type"] = "None"
    else:
        top10 = pd.DataFrame()

    # ── Build PDF ─────────────────────────────────────────────────────────────
    pdf = GhostFleetPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=15)

    # ════════════════════════════════════════════════════════════════════════
    # PAGE 1 — Executive Summary
    # ════════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.section_title("Page 1 — Synthese Executive")

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_fill_color(240, 249, 255)
    pdf.cell(0, 8, "Metriques cles", new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
    pdf.ln(2)

    pdf.kpi_row("Navires analyses (total)    :", total_ships)
    pdf.kpi_row("Navires suspects (score>0.3):", suspicious,  (234, 179, 8))
    pdf.kpi_row("Navires critiques (score>0.6):", critical,   (220, 38, 38))
    pdf.kpi_row("Flotte fantome (score>=0.8) :", ghost_fleet, (139, 0, 0))
    pdf.ln(4)

    pdf.section_title("Detection des anomalies")
    pdf.kpi_row("Total anomalies detectees   :", total_anom)
    pdf.kpi_row("  dont par regles metier    :", rule_anom)
    pdf.kpi_row("  dont par Isolation Forest :", ml_anom)
    pdf.ln(4)

    pdf.section_title("Repartition par type d'anomalie")
    for atype, cnt in type_counts.items():
        pdf.kpi_row(f"  {atype:<30}:", cnt)
    pdf.ln(4)

    pdf.section_title("Qualite des donnees")
    for key, val in quality_report.items():
        pdf.kpi_row(f"  {key:<35}:", val)

    # ════════════════════════════════════════════════════════════════════════
    # PAGE 2 — Top 10 Most Suspicious Ships
    # ════════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.section_title("Page 2 — Top 10 Navires les Plus Suspects")

    if top10.empty:
        pdf.set_font("Helvetica", "I", 11)
        pdf.cell(0, 10, "Aucun navire suspect detecte.",
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    else:
        # Table header
        col_w = [35, 20, 28, 45, 60]
        headers = ["MMSI", "Score", "Risque", "Derniere pos.", "Types anomalie"]
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(15, 23, 42)
        pdf.set_text_color(255, 255, 255)
        for w, h in zip(col_w, headers):
            pdf.cell(w, 7, h, border=1, fill=True)
        pdf.ln()
        pdf.set_text_color(0, 0, 0)

        for _, row in top10.iterrows():
            risk    = str(row.get("risk_level", "Normal"))
            r, g, b = RISK_COLORS.get(risk, (0, 0, 0))
            lat     = row.get("latitude", float("nan"))
            lon     = row.get("longitude", float("nan"))
            pos_str = f"{lat:.3f},{lon:.3f}" if not pd.isna(lat) else "N/A"
            anom_str = str(row.get("type", "N/A"))[:55]

            pdf.set_font("Helvetica", "", 8)
            pdf.set_fill_color(250, 250, 250)
            pdf.cell(col_w[0], 6, _safe_str(row["mmsi"]), border=1, fill=True)
            pdf.set_text_color(r, g, b)
            pdf.cell(col_w[1], 6, f"{row['score']:.2f}", border=1, fill=True)
            pdf.set_text_color(0, 0, 0)
            pdf.cell(col_w[2], 6, risk,    border=1, fill=True)
            pdf.cell(col_w[3], 6, pos_str, border=1, fill=True)
            pdf.cell(col_w[4], 6, anom_str, border=1, fill=True)
            pdf.ln()

    # ════════════════════════════════════════════════════════════════════════
    # PAGE 3 — Anomaly Breakdown
    # ════════════════════════════════════════════════════════════════════════
    pdf.add_page()
    pdf.section_title("Page 3 — Repartition des Anomalies")

    pdf.section_title("Par type")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(15, 23, 42)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(80, 7, "Type d'anomalie", border=1, fill=True)
    pdf.cell(30, 7, "Nombre",          border=1, fill=True)
    pdf.cell(40, 7, "% du total",      border=1, fill=True)
    pdf.ln()
    pdf.set_text_color(0, 0, 0)

    for atype, cnt in type_counts.items():
        pct = f"{100 * cnt / total_anom:.1f}%" if total_anom > 0 else "0%"
        pdf.set_font("Helvetica", "", 9)
        pdf.set_fill_color(250, 250, 250)
        pdf.cell(80, 6, atype,  border=1, fill=True)
        pdf.cell(30, 6, str(cnt), border=1, fill=True)
        pdf.cell(40, 6, pct,    border=1, fill=True)
        pdf.ln()

    pdf.ln(6)
    pdf.section_title("Par methode de detection")

    methods = {}
    if not anomalies_df.empty:
        methods = anomalies_df["detected_by"].value_counts().to_dict()

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(15, 23, 42)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(80, 7, "Methode", border=1, fill=True)
    pdf.cell(30, 7, "Nombre",  border=1, fill=True)
    pdf.ln()
    pdf.set_text_color(0, 0, 0)

    for method, cnt in methods.items():
        pdf.set_font("Helvetica", "", 9)
        pdf.set_fill_color(250, 250, 250)
        pdf.cell(80, 6, method,  border=1, fill=True)
        pdf.cell(30, 6, str(cnt), border=1, fill=True)
        pdf.ln()

    pdf.output(REPORT_PATH)
    print(f"[report_generator] PDF saved -> {REPORT_PATH}")
    return REPORT_PATH
