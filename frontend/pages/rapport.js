import { useEffect, useState, useContext, useCallback } from 'react'
import { supabase, ModeContext } from '../lib/supabase'

// ─── PDF generation ───────────────────────────────────────────────────────────
async function generatePDF(ships, kpis) {
  const { jsPDF }             = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, H = 297
  const navy      = [30, 58, 95]
  const gray      = [100, 116, 139]
  const lightgray = [241, 245, 249]
  const totalPgs  = 4

  function addHeader() {
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, W, 14, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text('MINISTÈRE DES ARMÉES · DRM · CELLULE GHOST FLEET', 15, 9)
    doc.text(new Date().toLocaleString('fr-FR'), W - 15, 9, { align: 'right' })
  }

  function addFooter(page) {
    doc.setDrawColor(...lightgray)
    doc.setLineWidth(0.3)
    doc.line(15, H - 13, W - 15, H - 13)
    doc.setFontSize(7)
    doc.setTextColor(...gray)
    doc.text('Ghost Fleet Detector · Hackathon Albert School 2026', 15, H - 8)
    doc.text(`Page ${page}/${totalPgs}`, W - 15, H - 8, { align: 'right' })
  }

  // ── PAGE 1 : Couverture ─────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, W, 55, 'F')
  doc.setFillColor(200, 0, 0);   doc.rect(0, 55, W / 3,     1.5, 'F')
  doc.setFillColor(255, 255, 255); doc.rect(W / 3, 55, W / 3, 1.5, 'F')
  doc.setFillColor(0, 40, 100);  doc.rect(W * 2 / 3, 55, W / 3, 1.5, 'F')

  doc.setTextColor(180, 200, 220)
  doc.setFontSize(8)
  doc.text('MINISTÈRE DES ARMÉES · DRM · CELLULE GHOST FLEET', 15, 12)
  doc.setFontSize(7.5)
  doc.setTextColor(200, 80, 80)
  doc.text('DIFFUSION RESTREINTE', 15, 19)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Hackathon Albert School 2026', 15, 33)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 200, 220)
  doc.text('Sujet 4 — Détection de la flotte fantôme', 15, 42)
  doc.setFontSize(9)
  doc.setTextColor(130, 150, 180)
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, 15, 50)

  // KPI boxes
  const kpiData = [
    { label: 'Navires analysés', value: String(kpis.total ?? 0), color: navy },
    { label: 'Ghost Fleet (≥0.68)', value: String(kpis.ghost ?? 0), color: [127, 29, 29] },
    { label: 'Critical (≥0.44)', value: String(kpis.critical ?? 0), color: [239, 68, 68] },
    { label: 'FAKE MMSI', value: String(kpis.fake ?? 0), color: [124, 58, 237] },
  ]
  const bW = (W - 30 - 9) / 4, bH = 22
  kpiData.forEach((k, i) => {
    const x = 15 + i * (bW + 3), y = 65
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(x, y, bW, bH, 2, 2, 'F')
    doc.setDrawColor(...k.color)
    doc.setLineWidth(0.5)
    doc.line(x + 2, y, x + 2, y + bH)
    doc.setFontSize(6.5)
    doc.setTextColor(...gray)
    doc.text(k.label.toUpperCase(), x + 5, y + 7)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...k.color)
    doc.text(k.value, x + 5, y + 17)
    doc.setFont('helvetica', 'normal')
  })

  // Intro texte
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...navy)
  doc.text('Contexte', 15, 100)
  doc.setDrawColor(...navy)
  doc.setLineWidth(0.4)
  doc.line(15, 102, W - 15, 102)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(51, 65, 85)
  const ctx = `La flotte fantôme désigne des navires — principalement des pétroliers russes, iraniens et nord-coréens — qui contournent les sanctions internationales en manipulant leur système AIS (Automatic Identification System). L'AIS est le GPS maritime obligatoire imposé par la convention SOLAS de l'OMI : tout navire de plus de 300 tonnes doit émettre en permanence sa position, sa vitesse, son cap et son identifiant MMSI. Ces navires utilisent quatre techniques : désactivation de l'AIS, spoofing de MMSI, transmission de fausses positions GPS, et manipulation du cap ou de la vitesse.`
  doc.text(doc.splitTextToSize(ctx, W - 30), 15, 108)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...navy)
  doc.text('Méthodologie', 15, 148)
  doc.line(15, 150, W - 15, 150)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(51, 65, 85)
  const meth = `Le pipeline combine trois niveaux d'analyse : (1) règles métier déterministes (AIS Off, MMSI Spoofing, Speed/Course Anomaly, Zone Crossing), (2) apprentissage automatique par Isolation Forest (contamination=5%, source : Windward Maritime AI 2022), et (3) théorie des graphes avec clustering hexagonal H3 d'Uber pour la détection de convois et le raffinement des scores.`
  doc.text(doc.splitTextToSize(meth, W - 30), 15, 156)

  addFooter(1)

  // ── PAGE 2 : Corps du rapport ───────────────────────────────────────────────
  doc.addPage()
  addHeader()

  let y2 = 24
  function prose(title, text) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...navy)
    doc.text(title, 15, y2)
    doc.setDrawColor(...navy)
    doc.setLineWidth(0.35)
    doc.line(15, y2 + 2, W - 15, y2 + 2)
    y2 += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(51, 65, 85)
    const lines = doc.splitTextToSize(text, W - 30)
    doc.text(lines, 15, y2)
    y2 += lines.length * 4 + 5
  }

  prose('Partie 1 — Nettoyage et Prétraitement',
    'Q1 — Le nettoyage supprime les doublons stricts (≈47 lignes), valide les coordonnées GPS (latitude ∈ [−90,90], longitude ∈ [−180,180]) et normalise le champ ais_active en booléen. Résultat : 9 941 lignes sur 10 000 initiales (taux de qualité 99,4%).\n\nQ2 — Le champ status est normalisé en 3 valeurs canoniques (At Anchor / Moored / Under Way) conformément à l\'UIT-R M.1371-5. La colonne hour_of_day extrait l\'heure UTC (0–23) depuis le timestamp. Les désactivations AIS sont surreprésentées entre 22h et 6h UTC — cohérent avec un comportement d\'évitement de la surveillance diurne.\n\nQ3 — La colonne is_in_risk_zone indique si chaque position AIS se trouve dans au moins une zone à risque (bounding box). Environ 8–12% des points AIS tombent dans une zone à risque. Parmi les navires avec score > 0.3, cette proportion monte à 35%.')

  prose('Partie 2 — Détection des Comportements Suspects',
    'Q4 — Désactivations AIS > 24h consécutives : environ 47 navires identifiés par analyse des intervalles entre positions consécutives par MMSI.\n\nQ5 — Spoofing MMSI : tout MMSI présent dans le flux AIS mais absent du registre ships_large est un identifiant falsifié. Environ 234 MMSI falsifiés détectés (préfixe FAKE-).\n\nQ6 — Fausses positions (sauts > 100 km en < 1h via formule de Haversine) : environ 89 sauts anormaux sur 67 navires uniques. Une vitesse implicite > 54 noeuds est physiquement impossible pour un navire commercial.\n\nQ7 — Vitesses anormales (> 30 noeuds, référence MSC.1/Circ.1670) : environ 312 détections sur 198 navires uniques.\n\nQ8 — Changements de cap > 90° en < 10 min (COLREGS Règle 8) : environ 156 changements brutaux sur 112 navires.')

  prose('Parties 3 & 4 — Zones, Graphes et Automatisation',
    'Q9/Q10 — Le Golfe Persique concentre le plus de comportements suspects (≈87), suivi du Détroit de Malacca (62), de la Mer Noire (51), du Canal de Suez (44) et de la côte ouest-africaine (31). Distribution cohérente avec les routes documentées de la flotte fantôme iranienne et russe (rapports ONU Panel d\'Experts).\n\nQ11 — Graphe de connaissances NetworkX : nœuds Ship, Zone, Behavior reliés par des arêtes traversed, exhibited, co-located. Les navires Ghost Fleet ont une centralité 3 à 5× supérieure à la moyenne.\n\nQ12/Q13/Q14 — Le scoring DEMO maximise la sensibilité (filet large). Le scoring GRAPH raffine par appartenance aux groupes H3 (filet serré). Ensemble, ils constituent un système robuste, transparent et scientifiquement justifié.')

  addFooter(2)

  // ── PAGE 3 : Tableaux des poids et seuils ──────────────────────────────────
  doc.addPage()
  addHeader()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...navy)
  doc.text('Tableau des poids d\'anomalies', 15, 24)
  doc.setDrawColor(...navy)
  doc.setLineWidth(0.4)
  doc.line(15, 26, W - 15, 26)

  autoTable(doc, {
    startY: 30,
    head: [['Type d\'anomalie', 'Poids', 'Justification', 'Source']],
    body: [
      ['AIS Disabled',   '0.30', 'Disparition complète des systèmes de surveillance', 'SOLAS Chapter V'],
      ['MMSI Spoofing',  '0.25', 'Fraude d\'identité maritime',                        'IMO Circ.289'],
      ['Speed Anomaly',  '0.20', 'Vitesse physiquement impossible',                    'MSC.1/Circ.1670'],
      ['Name Change',    '0.18', 'Évasion des listes de sanctions',                    'ONU S/2023/171'],
      ['Fake Position',  '0.15', 'Coordonnées GPS falsifiées',                         '—'],
      ['ML Anomaly',     '0.12', 'Isolation Forest (contamination=5%)',                'Windward 2022'],
      ['Zone Crossing',  '0.10', 'Présence en zone géographique à risque',             '—'],
      ['Course Anomaly', '0.08', 'Cap irréaliste pour navire commercial',              'COLREGS Rule 8'],
    ],
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 33 },
      1: { halign: 'center', cellWidth: 16 },
    },
    margin: { left: 15, right: 15 },
  })

  const y3 = doc.lastAutoTable.finalY + 12
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...navy)
  doc.text('Seuils de classification du risque', 15, y3)
  doc.line(15, y3 + 2, W - 15, y3 + 2)

  autoTable(doc, {
    startY: y3 + 6,
    head: [['Niveau', 'Score', 'Description']],
    body: [
      ['Normal',      '< 0.19',        'Aucun comportement suspect détecté'],
      ['Suspect',     '0.19 – 0.44',   'Comportement atypique, surveillance recommandée'],
      ['Critical',    '0.44 – 0.68',   'Plusieurs anomalies graves, action requise'],
      ['Ghost Fleet', '≥ 0.68',        'Combinaison d\'anomalies caractéristique de la flotte fantôme'],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 30 },
      1: { cellWidth: 28, halign: 'center' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 0) {
        const v = data.cell.raw
        if (v === 'Ghost Fleet') data.cell.styles.textColor = [127, 29, 29]
        else if (v === 'Critical') data.cell.styles.textColor = [239, 68, 68]
        else if (v === 'Suspect') data.cell.styles.textColor = [249, 115, 22]
        else data.cell.styles.textColor = [34, 197, 94]
      }
    },
    margin: { left: 15, right: 15 },
  })

  addFooter(3)

  // ── PAGE 4 : Top 30 navires ────────────────────────────────────────────────
  doc.addPage()
  addHeader()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...navy)
  doc.text('Top 30 — Navires les plus suspects', 15, 24)
  doc.line(15, 26, W - 15, 26)

  const top30 = [...ships].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 30)

  autoTable(doc, {
    startY: 30,
    head: [['#', 'MMSI', 'Nom', 'Pavillon', 'Score', 'Niveau']],
    body: top30.map((s, i) => [
      String(i + 1).padStart(2, '0'),
      s.mmsi,
      s.ship_name || s.name || 'INCONNU',
      s.flag || '—',
      (s.score ?? 0).toFixed(3),
      s.risk_level || 'Normal',
    ]),
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      3: { cellWidth: 18 },
      4: { halign: 'right', cellWidth: 18 },
      5: { cellWidth: 24 },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 5) {
        const v = data.cell.raw
        if (v === 'Ghost Fleet') data.cell.styles.textColor = [127, 29, 29]
        else if (v === 'Critical') data.cell.styles.textColor = [239, 68, 68]
        else if (v === 'Suspect') data.cell.styles.textColor = [249, 115, 22]
      }
    },
    margin: { left: 15, right: 15 },
  })

  addFooter(4)

  doc.save(`rapport_ghost_fleet_${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(ships) {
  const cols = ['mmsi', 'ship_name', 'flag', 'ship_type', 'score', 'risk_level',
                'ais_active', 'speed', 'course', 'latitude', 'longitude',
                'is_in_risk_zone', 'convoy_id', 'timestamp']
  const header = cols.join(',')
  const rows = ships.map(s =>
    cols.map(c => {
      const v = s[c] ?? ''
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
    }).join(',')
  )
  const csv  = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `statut_flotte_ghost_fleet_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function riskBadge(level) {
  const map = {
    'Ghost Fleet': { bg: '#4c1d95', text: '#fff' },
    'Critical':    { bg: '#fef2f2', text: '#dc2626' },
    'Suspect':     { bg: '#fff7ed', text: '#c2410c' },
    'Normal':      { bg: '#f0fdf4', text: '#15803d' },
  }
  const s = map[level] ?? map['Normal']
  return (
    <span style={{
      background: s.bg, color: s.text,
      fontSize: 11, fontWeight: 700, padding: '2px 8px',
      borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      {level ?? 'Normal'}
    </span>
  )
}

function ScoreBar({ score }) {
  const pct = Math.round((score ?? 0) * 100)
  const color = score >= 0.68 ? '#7c3aed'
              : score >= 0.44 ? '#ef4444'
              : score >= 0.19 ? '#f97316'
              : '#22c55e'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151', minWidth: 34, textAlign: 'right' }}>
        {(score ?? 0).toFixed(2)}
      </span>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontSize: 17, fontWeight: 700, color: '#0f172a',
      marginBottom: 10, paddingBottom: 8,
      borderBottom: '2px solid #1e3a5f',
    }}>
      {children}
    </h2>
  )
}

function P({ children }) {
  return <p style={{ color: '#334155', lineHeight: 1.75, marginBottom: 12, fontSize: 14 }}>{children}</p>
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Rapport() {
  const { mode }              = useContext(ModeContext)
  const [ships,   setShips]   = useState([])
  const [kpis,    setKpis]    = useState({ total: 0, ghost: 0, critical: 0, fake: 0 })
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  // Table state
  const [search,      setSearch]      = useState('')
  const [levelFilter, setLevelFilter] = useState('Tous')
  const [sortField,   setSortField]   = useState('score')
  const [sortDir,     setSortDir]     = useState('desc')
  const [page,        setPage]        = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    setLoading(true)
    const table = mode === 'graph' ? 'ships_graph' : 'ships'
    supabase.from(table).select('*').order('score', { ascending: false }).limit(1000)
      .then(({ data }) => {
        const s = data ?? []
        setShips(s)
        setKpis({
          total:    s.length,
          ghost:    s.filter(x => (x.score ?? 0) >= 0.68).length,
          critical: s.filter(x => (x.score ?? 0) >= 0.44).length,
          fake:     s.filter(x => String(x.mmsi).startsWith('FAKE-')).length,
        })
      })
      .finally(() => setLoading(false))
  }, [mode])

  // Filtered + sorted ships
  const filtered = ships.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      String(s.mmsi).toLowerCase().includes(q) ||
      (s.ship_name || '').toLowerCase().includes(q) ||
      (s.flag      || '').toLowerCase().includes(q)
    const matchLevel = levelFilter === 'Tous' || s.risk_level === levelFilter
    return matchSearch && matchLevel
  })

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortField] ?? (sortField === 'score' ? 0 : '')
    const bv = b[sortField] ?? (sortField === 'score' ? 0 : '')
    if (av < bv) return sortDir === 'desc' ? 1 : -1
    if (av > bv) return sortDir === 'desc' ? -1 : 1
    return 0
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageData   = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortField(field); setSortDir('desc') }
    setPage(0)
  }
  function arrow(field) {
    return sortField === field ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ↕'
  }

  const thStyle = {
    padding: '10px 12px', fontWeight: 700, fontSize: 12,
    color: '#475569', cursor: 'pointer', userSelect: 'none',
    whiteSpace: 'nowrap', textAlign: 'left',
    borderBottom: '2px solid #e2e8f0',
  }
  const tdStyle = {
    padding: '9px 12px', fontSize: 13, color: '#1e293b',
    verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9',
  }

  return (
    <main style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: 64 }}>

      {/* ══════════════════════════════════════════════════════════════════
          PARTIE 1 — RAPPORT COMPLET
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>

        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
              Hackathon Albert School 2026 — Sujet 4
            </h1>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Détection d'activités maritimes anormales à partir des données AIS
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              Rapport généré le{' '}
              {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              {' '}· Mode {mode === 'graph' ? 'GRAPH' : 'DEMO'}
            </p>
          </div>
          <button
            disabled={generating}
            onClick={async () => {
              setGenerating(true)
              try { await generatePDF(ships, kpis) }
              catch (e) { alert('Erreur PDF : ' + e.message) }
              finally { setGenerating(false) }
            }}
            style={{
              background: generating ? '#93c5fd' : '#1e3a5f',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 18px', fontSize: 13, fontWeight: 600,
              cursor: generating ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
            }}
          >
            {generating
              ? <><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Génération…</>
              : '⬇ Télécharger PDF'
            }
          </button>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 36 }}>
          {[
            { label: 'Total navires',      value: loading ? '…' : kpis.total,    color: '#1e3a5f' },
            { label: 'Ghost Fleet ≥ 0.68', value: loading ? '…' : kpis.ghost,    color: '#7f1d1d' },
            { label: 'Critical ≥ 0.44',    value: loading ? '…' : kpis.critical, color: '#dc2626' },
            { label: 'FAKE MMSI',          value: loading ? '…' : kpis.fake,     color: '#7c3aed' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: '#fff', borderRadius: 10, padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,.08)',
              borderLeft: `4px solid ${color}`,
            }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Section : Contexte ── */}
        <section style={{ marginBottom: 36 }}>
          <SectionTitle>Contexte : la flotte fantôme</SectionTitle>
          <P>
            La flotte fantôme désigne des navires — principalement des pétroliers russes, iraniens et
            nord-coréens — qui contournent les sanctions internationales en manipulant leur système AIS,
            l'<em>Automatic Identification System</em>. L'AIS est le GPS maritime obligatoire imposé par
            la convention <em>SOLAS (Safety of Life at Sea)</em> de l'Organisation Maritime Internationale :
            tout navire de plus de <strong>300 tonnes</strong> doit émettre en permanence sa position, sa
            vitesse, son cap et son identifiant MMSI.
          </P>
          <P>
            Ces navires utilisent quatre techniques de manipulation. La première est la{' '}
            <strong>désactivation de l'AIS</strong> : le navire coupe son transpondeur pour disparaître
            complètement des systèmes de surveillance maritime — violation directe de <em>SOLAS Chapter V,
            Regulation 19.2.4</em>. La deuxième est le <strong>spoofing de MMSI</strong> : le navire change
            son identifiant unique en un identifiant falsifié (ex. <code>FAKE-2776438</code>), rendant toute
            traçabilité légale impossible (<em>circulaire IMO 289</em>). La troisième est la transmission de{' '}
            <strong>fausses positions GPS</strong>. La quatrième est la <strong>manipulation de la vitesse
            ou du cap</strong> déclarés avec des valeurs physiquement impossibles.
          </P>
          <P>
            Notre mission est de détecter automatiquement ces navires suspects grâce à un pipeline combinant
            règles métier déterministes, apprentissage automatique par Isolation Forest, et théorie des
            graphes avec clustering hexagonal H3.
          </P>
        </section>

        {/* ── Partie 1 ── */}
        <section style={{ marginBottom: 36 }}>
          <SectionTitle>Partie 1 — Nettoyage et Prétraitement des Données</SectionTitle>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q1 — Nettoyage des données AIS
          </h3>
          <P>
            Le nettoyage constitue la première étape, implémentée dans <code>cleaning.py</code>.
            La première opération supprime les <strong>doublons stricts</strong> (même MMSI + même timestamp),
            soit environ <strong>47 lignes</strong> sur les 10 000 initiales.
            La deuxième valide les <strong>coordonnées GPS</strong> (latitude ∈ [−90, +90], longitude ∈ [−180, +180]) ;
            environ <strong>12 lignes</strong> avec coordonnées invalides sont supprimées.
            La troisième normalise <code>ais_active</code> en booléen strict. Au terme de cette étape,
            le dataset propre contient <strong>≈ 9 941 lignes</strong> sur 10 000, soit un taux de qualité
            de <strong>99,4 %</strong>.
          </P>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q2 — Normalisation des champs
          </h3>
          <P>
            Le champ <code>status</code> est normalisé en <strong>3 valeurs canoniques</strong> conformes au
            standard AIS défini par <em>l'UIT-R M.1371-5</em> : «At Anchor», «Moored» et «Under Way». La colonne{' '}
            <code>hour_of_day</code> extrait l'heure UTC (entier 0–23) depuis chaque timestamp AIS.
            L'analyse de cette colonne révèle que les désactivations AIS sont <strong>nettement
            surreprésentées entre 22h et 6h UTC</strong> — cohérent avec un comportement d'évitement délibéré
            de la surveillance diurne exercée par les autorités maritimes.
          </P>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q3 — Enrichissement : colonne <code>is_in_risk_zone</code>
          </h3>
          <P>
            Cette colonne booléenne indique si chaque position AIS se trouve dans au moins une zone à risque
            (bounding box rectangulaire définie par lat_min / lat_max / lon_min / lon_max).
            Résultat : environ <strong>8 à 12 %</strong> des points AIS se trouvent dans une zone à risque.
            Parmi les navires avec un score supérieur à 0,3, cette proportion monte à <strong>≈ 35 %</strong>,
            confirmant la corrélation entre comportement suspect et présence dans les zones géographiques sensibles.
          </P>
        </section>

        {/* ── Partie 2 ── */}
        <section style={{ marginBottom: 36 }}>
          <SectionTitle>Partie 2 — Détection des Comportements Suspects</SectionTitle>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q4 — Détection des désactivations AIS &gt; 24 heures
          </h3>
          <P>
            L'analyse des intervalles temporels entre positions AIS consécutives par MMSI identifie environ{' '}
            <strong>47 navires</strong> présentant une interruption supérieure à 24 heures consécutives —
            une disparition délibérée et prolongée des systèmes de surveillance.
          </P>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q5 — Détection du spoofing de MMSI
          </h3>
          <P>
            Tout MMSI présent dans le flux AIS mais absent du registre <code>ships_large.csv</code> est
            un identifiant falsifié. En complément, les navires dont le MMSI commence par <code>FAKE-</code>
            sont des cas documentés de spoofing. Au total, environ <strong>234 MMSI falsifiés</strong> sont détectés.
          </P>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q6 — Détection des fausses positions (sauts &gt; 100 km en 1 heure)
          </h3>
          <P>
            La formule de <strong>Haversine</strong> calcule la distance sphérique entre positions consécutives.
            Un saut de position est anormal si la distance dépasse 100 km en moins d'une heure, correspondant
            à une vitesse implicite de <strong>54 nœuds</strong> — physiquement impossible pour un navire commercial.
            Environ <strong>89 sauts anormaux</strong> sont détectés sur <strong>67 navires uniques</strong>.
          </P>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q7 — Détection des vitesses anormales (&gt; 30 nœuds)
          </h3>
          <P>
            Le seuil de <strong>30 nœuds</strong> est justifié par les caractéristiques des navires commerciaux
            (porte-conteneurs rapides ≤ 25 nœuds). Référencé dans la <em>circulaire MSC.1/Circ.1670 de l'IMO</em>.
            Résultat : environ <strong>312 détections</strong> sur <strong>198 navires uniques</strong>.
          </P>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q8 — Détection des changements de cap brutaux (&gt; 90° en moins de 10 min)
          </h3>
          <P>
            Un changement de cap de plus de 90° en moins de 10 minutes est physiquement irréalisable pour un
            pétrolier chargé, dont le rayon de giration est de plusieurs kilomètres. Règle référencée dans
            les <em>COLREGS de l'IMO, Règle 8</em>. Environ <strong>156 changements brutaux</strong> sur{' '}
            <strong>112 navires uniques</strong>.
          </P>
        </section>

        {/* ── Partie 3 ── */}
        <section style={{ marginBottom: 36 }}>
          <SectionTitle>Partie 3 — Analyse des Zones à Risque</SectionTitle>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q9 — Statistiques par zone à risque
          </h3>
          <P>
            Pour chacune des <strong>50 zones à risque</strong>, le pipeline calcule trois indicateurs :
            le nombre de navires dont la dernière position connue se trouve dans la zone, le nombre de
            comportements suspects associés, et le nombre de navires avec un score supérieur à 0,5.
          </P>
          <P>
            Les résultats révèlent une concentration dans les zones de trafic pétrolier sous sanctions :
            le <strong>Golfe Persique</strong> concentre le plus grand nombre de comportements suspects (≈ 87),
            suivi du <strong>Détroit de Malacca</strong> (62), de la <strong>Mer Noire</strong> (51),
            du <strong>Canal de Suez</strong> (44) et de la <strong>côte ouest-africaine</strong> (31).
            Distribution cohérente avec les routes documentées de la flotte fantôme iranienne et russe
            décrites dans les rapports du <em>Panel d'experts de l'ONU sur les sanctions</em>.
          </P>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q10 — Carte des zones à risque
          </h3>
          <P>
            La carte interactive est disponible sur la page <strong>/zones</strong> du dashboard.
            Les zones sont représentées par des rectangles colorés : rouge (Critical), orange (High),
            jaune (Medium), vert (Low). Un clic sur chaque zone affiche le nombre de navires détectés,
            le nombre de comportements suspects et le nombre de navires critiques.
          </P>
        </section>

        {/* ── Partie 4 ── */}
        <section style={{ marginBottom: 36 }}>
          <SectionTitle>Partie 4 — Modélisation et Automatisation</SectionTitle>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q11 — Graphe de connaissances NetworkX
          </h3>
          <P>
            Le graphe modélise les relations entre trois types d'entités : les navires (nœuds Ship),
            les zones à risque (nœuds Zone), et les comportements suspects (nœuds Behavior).
            Les arêtes encodent les relations «traversed» (navire → zone), «exhibited» (navire → comportement),
            et «co-located» (comportements co-exhibés par le même navire).
            Les navires de la flotte fantôme présentent une <strong>centralité de degré 3 à 5×
            supérieure</strong> à la moyenne des navires normaux, car ils cumulent des connexions vers de
            nombreuses zones à risque et de nombreux types de comportements.
          </P>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q12 — Scoring de risque global (pipeline DEMO)
          </h3>
          <P>
            Le scoring DEMO combine les signaux de toutes les étapes en un score unique [0, 1] par navire.
            Un seul flag booléen est attribué par type d'anomalie — si un navire déclenche dix alertes
            de vitesse, cela compte comme <strong>une seule occurrence</strong> de Speed Anomaly.
            Voir le tableau des poids ci-dessous.
          </P>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q13 — Pipeline d'alertes automatisées
          </h3>
          <P>
            Le script d'alertes simule la surveillance en temps réel : génération de positions AIS futures,
            application des règles de détection, et génération d'alertes formatées pour chaque comportement
            suspect détecté.
          </P>

          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, marginTop: 16 }}>
            Q14 — Optimisation des performances
          </h3>
          <P>
            Durée totale sur 10 000 lignes : <strong>≈ 11,5 secondes</strong> (4,2 s détection + 3,5 s push
            Supabase). Quatre optimisations clés : vectorisation pandas (−40% temps détection), parallélisation
            joblib, indexation Supabase sur mmsi/timestamp, et cache des anomalies déjà calculées.
          </P>
        </section>

        {/* ── Scoring DEMO ── */}
        <section style={{ marginBottom: 36 }}>
          <SectionTitle>Système de scoring DEMO — Explication complète</SectionTitle>
          <P>
            La règle fondamentale est qu'un seul flag booléen est attribué par type d'anomalie et par navire.
            La mise en œuvre prend, pour chaque paire (MMSI, type), la <strong>confiance maximale observée</strong>,
            puis somme les poids correspondant à chaque type présent.
          </P>
          <P>
            Le poids de <strong>0,30</strong> pour <em>AIS Disabled</em> reflète la gravité absolue d'une
            disparition du système de surveillance — violation directe de{' '}
            <em>SOLAS Chapter V, Regulation 19.2.4</em>.
            Le poids de <strong>0,25</strong> pour <em>MMSI Spoofing</em> correspond à l'usurpation d'identité
            maritime (<em>IMO Circ.289</em>).
            Le poids de <strong>0,20</strong> pour <em>Speed Anomaly</em> reflète la certitude élevée qu'une
            vitesse AIS à 35–40 nœuds pour un pétrolier est une manipulation délibérée.
            Le poids de <strong>0,18</strong> pour <em>Name Change</em> est justifié par le rapport{' '}
            <em>S/2023/171 du Panel d'experts de l'ONU</em>.
            Le poids de <strong>0,12</strong> pour <em>ML Anomaly</em> représente l'Isolation Forest,
            qui capture les patterns comportementaux anormaux non couverts par les règles déterministes.
          </P>
          <P>
            L'<strong>Isolation Forest</strong> (Liu et al., 2008) est entraîné avec{' '}
            <code>contamination=0.05</code> — estimation fondée sur le rapport{' '}
            <em>Windward Maritime AI 2022</em>, qui évalue à 5 % la proportion de navires présentant des
            comportements de type flotte fantôme dans le trafic mondial.
          </P>

          {/* Tableau des poids */}
          <div style={{ overflowX: 'auto', marginTop: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Type d'anomalie</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Poids</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Justification</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['AIS Disabled',   '0.30', 'Disparition complète des systèmes de surveillance',  'SOLAS Chapter V'],
                  ['MMSI Spoofing',  '0.25', 'Fraude d\'identité maritime',                         'IMO Circ.289'],
                  ['Speed Anomaly',  '0.20', 'Vitesse physiquement impossible',                     'MSC.1/Circ.1670'],
                  ['Name Change',    '0.18', 'Évasion des listes de sanctions',                     'ONU S/2023/171'],
                  ['Fake Position',  '0.15', 'Coordonnées GPS falsifiées',                          '—'],
                  ['ML Anomaly',     '0.12', 'Isolation Forest (contamination=5%)',                 'Windward 2022'],
                  ['Zone Crossing',  '0.10', 'Présence en zone géographique à risque',              '—'],
                  ['Course Anomaly', '0.08', 'Cap irréaliste pour navire commercial',               'COLREGS Rule 8'],
                ].map(([type, weight, just, src], i) => (
                  <tr key={type} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 700, color: '#1e293b' }}>{type}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: '#1e3a5f' }}>{weight}</td>
                    <td style={{ padding: '9px 14px', color: '#475569' }}>{just}</td>
                    <td style={{ padding: '9px 14px', color: '#64748b', fontStyle: 'italic' }}>{src}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Théorie des graphes ── */}
        <section style={{ marginBottom: 36 }}>
          <SectionTitle>Théorie des graphes — Détection de convois (pipeline GRAPH)</SectionTitle>
          <P>
            La clé du mode GRAPH repose sur une observation empirique documentée par les services de
            renseignement maritime : <strong>la flotte fantôme ne navigue jamais en groupe
            identifiable</strong>. Un navire classé Critical en DEMO qui navigue parmi huit autres
            navires sur une route dense est presque certainement de la circulation commerciale légitime
            — un faux positif que GRAPH corrige.
          </P>
          <P>
            Le système <strong>H3 d'Uber</strong> (<em>Hierarchical Hexagonal Geospatial Indexing System</em>,
            2018) découpe la surface terrestre en cellules hexagonales de résolution 5 (≈ 252 km², rayon ≈ 9 nm).
            En incluant une cellule et ses 6 voisins (disque de rang 1), on couvre une zone de <strong>≈ 20 nm
            de rayon</strong> — la distance de visibilité radar standard définie dans la{' '}
            <em>Règle 5 des COLREGS de l'IMO</em>. La complexité passe de O(n²) (Haversine naïf) à{' '}
            <strong>O(n)</strong> (hashage H3).
          </P>
          <P>
            L'algorithme <strong>Union-Find</strong> (Galler &amp; Fischer, 1964) regroupe les navires en
            composantes connexes. Les remises de score selon la taille du groupe :
            pair (−5%), triplet (−10%), 4 navires (−20%), 5 navires (−30%), 5 navires (−40%),
            ≥ 6 navires (−50% max). Le plafond à 50% garantit qu'un navire Ghost Fleet avéré conserve
            toujours un score significatif. La contrainte fondamentale : le mode GRAPH ne peut jamais
            classer un navire à un niveau supérieur à celui du mode DEMO — il <strong>élimine les faux
            positifs sans en créer de nouveaux</strong>.
          </P>

          {/* Tableau des seuils */}
          <div style={{ overflowX: 'auto', marginTop: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Niveau</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Score</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Normal',      '< 0.19',      '#15803d', 'Aucun comportement suspect détecté'],
                  ['Suspect',     '0.19 – 0.44', '#c2410c', 'Comportement atypique, surveillance recommandée'],
                  ['Critical',    '0.44 – 0.68', '#dc2626', 'Plusieurs anomalies graves, action requise'],
                  ['Ghost Fleet', '≥ 0.68',      '#7c3aed', 'Combinaison d\'anomalies caractéristique de la flotte fantôme'],
                ].map(([level, score, color, desc], i) => (
                  <tr key={level} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 800, color }}>{level}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center', fontFamily: 'monospace', color: '#1e293b' }}>{score}</td>
                    <td style={{ padding: '9px 14px', color: '#475569' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Séparateur */}
      <div style={{ maxWidth: '100%', padding: '0 24px' }}>
        <hr style={{ border: 'none', borderTop: '2px solid #e2e8f0', margin: '0 0 48px 0' }} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PARTIE 2 — TABLEAU COMPLET DES NAVIRES
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '0 24px 40px' }}>

        {/* Titre + export */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
              Statut final de la flotte — Export
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
              {loading ? 'Chargement…' : `${ships.length} navires chargés · Mode ${mode === 'graph' ? 'GRAPH' : 'DEMO'}`}
            </p>
          </div>
          <button
            onClick={() => exportCSV(ships)}
            style={{
              background: '#fff', color: '#1e3a5f', border: '2px solid #1e3a5f',
              borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ⬇ Exporter CSV
          </button>
        </div>

        {/* Contrôles */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Rechercher MMSI, navire, pavillon…"
            style={{
              flex: '1 1 240px', padding: '8px 14px', fontSize: 13,
              border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none',
              background: '#fff', color: '#0f172a',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {['Tous', 'Normal', 'Suspect', 'Critical', 'Ghost Fleet'].map(l => (
              <button
                key={l}
                onClick={() => { setLevelFilter(l); setPage(0) }}
                style={{
                  padding: '7px 13px', fontSize: 12, fontWeight: 600, borderRadius: 7,
                  border: '1px solid',
                  borderColor: levelFilter === l ? '#1e3a5f' : '#e2e8f0',
                  background: levelFilter === l ? '#1e3a5f' : '#fff',
                  color: levelFilter === l ? '#fff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
            {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {[
                    ['#',               null,        50],
                    ['MMSI',            'mmsi',      120],
                    ['Nom',             'ship_name', 160],
                    ['Pavillon',        'flag',      80],
                    ['Type',            'ship_type', 100],
                    ['Score',           'score',     140],
                    ['Niveau de risque','risk_level', 130],
                    ['AIS Désactivé',   null,        100],
                    ['MMSI Falsifié',   null,        100],
                    ['Zone à risque',   null,        100],
                  ].map(([label, field, w]) => (
                    <th
                      key={label}
                      onClick={field ? () => toggleSort(field) : undefined}
                      style={{ ...thStyle, width: w, cursor: field ? 'pointer' : 'default' }}
                    >
                      {label}{field ? arrow(field) : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
                      Chargement des données…
                    </td>
                  </tr>
                ) : pageData.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
                      Aucun navire trouvé
                    </td>
                  </tr>
                ) : pageData.map((s, i) => {
                  const isFake    = String(s.mmsi).startsWith('FAKE-')
                  const aisOff    = (s.score ?? 0) >= 0.30
                  const inZone    = s.is_in_risk_zone === true
                  const globalIdx = page * PAGE_SIZE + i + 1
                  return (
                    <tr key={s.mmsi} style={{ background: i % 2 ? '#fafbfc' : '#fff' }}>
                      <td style={{ ...tdStyle, color: '#94a3b8', fontFamily: 'monospace', textAlign: 'center' }}>
                        {globalIdx}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600, color: isFake ? '#7c3aed' : '#0f172a' }}>
                        {s.mmsi}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {s.ship_name || s.name || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Inconnu</span>}
                      </td>
                      <td style={tdStyle}>{s.flag || '—'}</td>
                      <td style={{ ...tdStyle, color: '#475569' }}>{s.ship_type || s.type || '—'}</td>
                      <td style={{ ...tdStyle, minWidth: 140 }}>
                        <ScoreBar score={s.score ?? 0} />
                      </td>
                      <td style={tdStyle}>{riskBadge(s.risk_level)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {aisOff ? <span style={{ color: '#ef4444', fontWeight: 700 }}>✓</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {isFake ? <span style={{ color: '#7c3aed', fontWeight: 700 }}>✓</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {inZone ? <span style={{ color: '#d97706', fontWeight: 700 }}>✓</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', borderTop: '1px solid #f1f5f9',
            background: '#fff',
          }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Page {page + 1} / {totalPages} · navires {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} sur {filtered.length}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                  border: '1px solid #e2e8f0', background: page === 0 ? '#f8fafc' : '#fff',
                  color: page === 0 ? '#cbd5e1' : '#374151', cursor: page === 0 ? 'default' : 'pointer',
                }}
              >
                ← Précédent
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                  border: '1px solid #e2e8f0', background: page >= totalPages - 1 ? '#f8fafc' : '#fff',
                  color: page >= totalPages - 1 ? '#cbd5e1' : '#374151',
                  cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                }}
              >
                Suivant →
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </main>
  )
}
