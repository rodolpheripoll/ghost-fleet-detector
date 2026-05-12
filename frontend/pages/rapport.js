import { useEffect, useState, useContext } from 'react'
import { supabase, ModeContext } from '../lib/supabase'

const SECTIONS = [
  { label: 'Synthèse exécutive',         pages: '1 p', defaultChecked: true },
  { label: 'KPI — analyse globale',       pages: '1 p', defaultChecked: true },
  { label: 'Top 10 navires suspects',     pages: '2 p', defaultChecked: true },
  { label: 'Convois détectés',            pages: '2 p', defaultChecked: true },
  { label: 'Cartographie — théâtre mondial', pages: '1 p', defaultChecked: true },
  { label: 'Méthodologie & scoring',      pages: '2 p', defaultChecked: true },
  { label: 'Annexe — fiches navires',     pages: '14 p', defaultChecked: false },
  { label: 'Annexe — export CSV brut',    pages: '— p', defaultChecked: false },
]

const HISTORY = [
  { title: 'Note RM — semaine 18',                id: 'RPT-2026-W18', size: '1.4 Mo', date: '05/05/2026' },
  { title: 'Dossier mer Noire — convoi Karkinit', id: 'RPT-2026-014', size: '4.2 Mo', date: '02/05/2026' },
  { title: 'Note RM — semaine 17',                id: 'RPT-2026-W17', size: '1.3 Mo', date: '28/04/2026' },
]

const FILE_ICON = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <path d="M14 3v6h6"/>
  </svg>
)

export default function Rapport() {
  const { mode }              = useContext(ModeContext)
  const [ships,   setShips]   = useState([])
  const [loading, setLoading] = useState(true)
  const [template, setTemplate] = useState('officiel') // officiel | brief | dossier
  const [format,   setFormat]   = useState('pdf')       // pdf | docx | csv
  const [classification, setClassif] = useState('Diffusion restreinte')
  const [sections, setSections] = useState(
    Object.fromEntries(SECTIONS.map(s => [s.label, s.defaultChecked]))
  )

  useEffect(() => {
    setLoading(true)
    const table = mode === 'graph' ? 'ships_graph' : 'ships'
    const q = mode === 'graph'
      ? supabase.from(table).select('*').order('score', { ascending: false }).limit(10)
      : supabase.from(table).select('*').neq('flag', 'Unknown').order('score', { ascending: false }).limit(10)
    q.then(({ data }) => setShips(data ?? [])).finally(() => setLoading(false))
  }, [mode])


  const suspicious = ships.filter(s => (s.score ?? 0) >= 0.19).length
  const critical   = ships.filter(s => (s.score ?? 0) >= 0.44).length
  const ghost      = ships.filter(s => (s.score ?? 0) >= 0.68).length

  const [sortField, setSortField] = useState('score')
  const [sortDir,   setSortDir]   = useState('desc')

  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortField(field); setSortDir('desc') }
  }
  function arrow(field) {
    if (sortField !== field) return ' ↕'
    return sortDir === 'desc' ? ' ↓' : ' ↑'
  }

  const sortedShips = [...ships].sort((a, b) => {
    const av = a[sortField] ?? (sortField === 'score' ? 0 : '')
    const bv = b[sortField] ?? (sortField === 'score' ? 0 : '')
    if (av < bv) return sortDir === 'desc' ? 1 : -1
    if (av > bv) return sortDir === 'desc' ? -1 : 1
    return 0
  })
  const top5 = sortedShips.slice(0, 5)

  function riskLabel(score) {
    if (score >= 0.68) return 'Ghost'
    if (score >= 0.44) return 'Crit.'
    if (score >= 0.19) return 'Susp.'
    return 'Normal'
  }
  function riskColor(score) {
    if (score >= 0.68) return '#7f1d1d'
    if (score >= 0.44) return '#ef4444'
    if (score >= 0.19) return '#c2410c'
    return '#22c55e'
  }

  return (
    <main className="px-8 py-7">
      {/* Page header */}
      <section className="flex items-end justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-[12px] mb-2" style={{ color: 'var(--muted)' }}>
            <span>Renseignement maritime</span>
            <span style={{ color: 'var(--line)' }}>/</span>
            <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>Rapport</span>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
            Génération du rapport — diffusion restreinte
          </h1>
          <div className="text-[13.5px] mt-1" style={{ color: 'var(--muted)' }}>
            Compose, prévisualise et exporte un rapport PDF officiel destiné à la chaîne de commandement.
          </div>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-6">

        {/* LEFT: composer */}
        <div className="col-span-5 space-y-5">

          {/* Template */}
          <div className="card p-5">
            <div className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>Modèle de rapport</div>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { key: 'officiel', tier: 'Officiel', name: 'Note de RM', pages: '8–12 pages' },
                { key: 'brief',    tier: 'Synthèse', name: 'Brief',      pages: '2 pages' },
                { key: 'dossier', tier: 'Détaillé', name: 'Dossier',    pages: '24+ pages' },
              ].map(({ key, tier, name, pages }) => (
                <label key={key} className="cursor-pointer" onClick={() => setTemplate(key)}>
                  <div className={`rounded-lg border-2 p-3 text-center${template === key ? ' border-[var(--navy)]' : ' border-[var(--line)] bg-white hover:border-[var(--navy-3)]'}`}
                    style={template === key ? { background: '#f5f8fd', borderColor: 'var(--navy)' } : {}}>
                    <div className="text-[10px] uppercase font-bold tracking-wide"
                      style={{ color: template === key ? 'var(--navy)' : 'var(--muted)' }}>{tier}</div>
                    <div className="text-[12.5px] font-bold mt-0.5">{name}</div>
                    <div className="text-[10.5px] mt-1" style={{ color: 'var(--muted)' }}>{pages}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Meta */}
          <div className="card p-5">
            <div className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>En-tête</div>
            <div className="space-y-3 text-[12.5px]">
              <div>
                <label className="font-semibold text-[11.5px]" style={{ color: 'var(--muted)' }}>Titre</label>
                <input className="w-full mt-1 px-3 py-2 rounded-lg border outline-none"
                  style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
                  defaultValue="Détection de la flotte fantôme — semaine 19" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[11.5px]" style={{ color: 'var(--muted)' }}>Période</label>
                  <input className="w-full mt-1 px-3 py-2 rounded-lg border outline-none"
                    style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
                    defaultValue="05/05/2026 — 12/05/2026" />
                </div>
                <div>
                  <label className="font-semibold text-[11.5px]" style={{ color: 'var(--muted)' }}>Classification</label>
                  <select className="w-full mt-1 px-3 py-2 rounded-lg border outline-none"
                    style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
                    value={classification} onChange={e => setClassif(e.target.value)}>
                    <option>Diffusion restreinte</option>
                    <option>Confidentiel défense</option>
                    <option>Non classifié</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-semibold text-[11.5px]" style={{ color: 'var(--muted)' }}>Destinataire</label>
                <input className="w-full mt-1 px-3 py-2 rounded-lg border outline-none"
                  style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
                  defaultValue="EMA / J2 — Centre de planification et de conduite" />
              </div>
              <div>
                <label className="font-semibold text-[11.5px]" style={{ color: 'var(--muted)' }}>Rédacteur</label>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                    style={{ background: 'linear-gradient(135deg,#3a6aa8,#1e3a5f)' }}>CV</div>
                  <div>
                    <div className="text-[13px] font-semibold">C. Vasseur</div>
                    <div className="text-[11px]" style={{ color: 'var(--muted)' }}>DRM · Cellule Ghost Fleet</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Sections incluses</div>
              <button className="text-[11px] font-semibold hover:underline" style={{ color: 'var(--navy-3)' }}
                onClick={() => setSections(Object.fromEntries(SECTIONS.map(s => [s.label, true])))}>
                Tout cocher
              </button>
            </div>
            <div className="space-y-2.5 text-[13px]">
              {SECTIONS.map(({ label, pages }) => (
                <label key={label} className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="flex items-center gap-2.5">
                    <input type="checkbox" className="check" checked={sections[label] ?? false}
                      onChange={e => setSections(s => ({ ...s, [label]: e.target.checked }))} />
                    {label}
                  </span>
                  <span className="mono text-[11px]" style={{ color: 'var(--muted)' }}>{pages}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="card p-5">
            <div className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>Format de sortie</div>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { key: 'pdf',  label: 'PDF',  sub: 'A4 · 8 p · ~1.4 Mo' },
                { key: 'docx', label: 'DOCX', sub: 'Word' },
                { key: 'csv',  label: 'CSV',  sub: 'Données' },
              ].map(({ key, label, sub }) => (
                <label key={key} className="cursor-pointer" onClick={() => setFormat(key)}>
                  <div className={`rounded-lg p-3 text-center border-2${format === key ? '' : ' border-[var(--line)] bg-white hover:border-[var(--navy-3)]'}`}
                    style={format === key ? { borderColor: 'var(--navy)', background: '#f5f8fd' } : {}}>
                    <div className="text-[18px] font-bold">{label}</div>
                    <div className="text-[10.5px]" style={{ color: 'var(--muted)' }}>{sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button className="flex-1 text-[14px] font-semibold border rounded-lg px-4 py-3 hover:bg-[var(--line-2)]"
              style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}>
              Enregistrer brouillon
            </button>
            <button className="flex-1 text-[14px] font-semibold text-white rounded-lg px-4 py-3 flex items-center justify-center gap-2"
              style={{ background: 'var(--navy)' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/>
              </svg>
              Générer le PDF
            </button>
          </div>

          {/* History */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Historique des rapports</div>
              <button className="text-[11px] font-semibold hover:underline" style={{ color: 'var(--navy-3)' }}>Voir tout</button>
            </div>
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {HISTORY.map(({ title, id, size, date }) => (
                <li key={id} className="flex items-center gap-3 py-2.5">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: '#fef2f2', color: '#7f1d1d' }}>
                    {FILE_ICON}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{title}</div>
                    <div className="text-[11.5px] mono" style={{ color: 'var(--muted)' }}>{id} · {size}</div>
                  </div>
                  <span className="text-[11.5px] shrink-0" style={{ color: 'var(--muted)' }}>{date}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* RIGHT: paper preview */}
        <div className="col-span-7">
          <div className="card p-6 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[11px] uppercase font-bold tracking-wide" style={{ color: 'var(--muted)' }}>Aperçu</div>
                <h3 className="text-[15px] font-bold tracking-tight">Note de renseignement maritime · page 1/8</h3>
              </div>
              <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: 'var(--line-2)' }}>
                {['1','2','3','…','8'].map((p, i) => (
                  <button key={p} className="px-2.5 py-1 text-[12px] font-semibold rounded-md"
                    style={i === 0 ? { background: 'var(--paper)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: 'var(--muted)' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Paper */}
            <div className="rounded-xl p-8 flex items-start justify-center" style={{ background: 'var(--line-2)', minHeight: 880 }}>
              <div className="paper relative" style={{ aspectRatio: '1/1.414' }}>
                {/* Tricolor strip */}
                <div className="tricolor">
                  <div style={{ background: '#002654' }} />
                  <div style={{ background: '#fff' }} />
                  <div style={{ background: '#ce1126' }} />
                </div>

                {/* Stamp */}
                <div className="paper-stamp" style={{ top: 34, right: 32, transform: 'rotate(-4deg)', color: '#7f1d1d' }}>
                  DIFFUSION RESTREINTE
                </div>

                <div className="px-12 pt-12">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="mono text-[8px] tracking-[.18em]" style={{ color: 'var(--muted)' }}>MINISTÈRE DES ARMÉES · DRM</div>
                      <div className="mono text-[8px] tracking-[.18em]" style={{ color: 'var(--muted)' }}>CELLULE GHOST FLEET</div>
                    </div>
                    <div className="text-right">
                      <div className="mono text-[8px]" style={{ color: 'var(--muted)' }}>N° RPT-2026-W19</div>
                      <div className="mono text-[8px]" style={{ color: 'var(--muted)' }}>12 mai 2026 · 14:37 UTC</div>
                    </div>
                  </div>

                  <div className="mt-10">
                    <div className="text-[10px] uppercase tracking-[.18em] font-bold" style={{ color: 'var(--navy)' }}>
                      Note de renseignement maritime
                    </div>
                    <h1 className="text-[22px] font-extrabold tracking-tight mt-1 leading-tight">
                      Détection de la flotte fantôme<br/>Semaine 19 · 05–12 mai 2026
                    </h1>
                    <div className="text-[10px] mt-2" style={{ color: 'var(--muted)' }}>
                      Destinataire — EMA / J2 · Centre de planification et de conduite
                    </div>
                  </div>

                  {/* Mini KPI row */}
                  <div className="grid grid-cols-4 gap-2 mt-6">
                    {[
                      { label: 'Analysés', value: ships.length > 0 ? ships.length.toLocaleString('fr-FR') : '12 847', color: 'var(--ink)' },
                      { label: 'Suspects', value: suspicious > 0 ? suspicious : '342', color: '#c2410c' },
                      { label: 'Critical',  value: critical  > 0 ? critical  : '87',  color: '#ef4444' },
                      { label: 'Ghost',     value: ghost     > 0 ? ghost     : '14',  color: '#7f1d1d' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="border rounded-md p-2" style={{ borderColor: 'var(--line)' }}>
                        <div className="text-[7px] uppercase font-bold tracking-wider" style={{ color: 'var(--muted)' }}>{label}</div>
                        <div className="mono text-[14px] font-bold mt-0.5" style={{ color }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Synthèse */}
                  <div className="mt-6">
                    <div className="text-[10px] uppercase tracking-[.16em] font-bold pb-1 border-b" style={{ color: 'var(--navy)', borderColor: 'var(--line)' }}>
                      1 · Synthèse exécutive
                    </div>
                    <p className="text-[10px] leading-[1.55] mt-2" style={{ color: 'var(--ink-3)' }}>
                      Sur la période du 05 au 12 mai 2026, le système a analysé <b>12 847 navires</b> à partir des flux AIS satellites et de la corrélation SAR. Quatorze unités présentent un score d'anomalie supérieur à 0.90 et sont classées <b>Ghost Fleet</b>. Trois convois actifs ont été identifiés en mer Noire, golfe Persique et mer Égée, totalisant 16 navires et un tonnage brut estimé à 2,4 M t.
                    </p>
                    <p className="text-[10px] leading-[1.55] mt-2" style={{ color: 'var(--ink-3)' }}>
                      L'incident le plus marquant concerne le tanker <b>NORDIC STAR</b> (MMSI 273 456 789, pavillon RUS), dont l'AIS a été éteint pendant 18 h 32 min au large de la péninsule de Karkinit, avec reprise à 84 NM de la position projetée.
                    </p>
                  </div>

                  {/* Mini chart */}
                  <div className="mt-5">
                    <div className="text-[10px] uppercase tracking-[.16em] font-bold pb-1 border-b" style={{ color: 'var(--navy)', borderColor: 'var(--line)' }}>
                      2 · Indicateurs hebdomadaires
                    </div>
                    <svg viewBox="0 0 320 90" className="w-full mt-2">
                      <line x1="20" y1="78" x2="320" y2="78" stroke="#e5ebf2"/>
                      <path d="M20,70 L60,60 L100,50 L140,40 L180,45 L220,30 L260,28 L300,18" fill="none" stroke="#1e3a5f" strokeWidth="1.8"/>
                      <path d="M20,70 L60,60 L100,50 L140,40 L180,45 L220,30 L260,28 L300,18 L300,78 L20,78 Z" fill="#1e3a5f" fillOpacity=".1"/>
                      <g fontFamily="JetBrains Mono" fontSize="6" fill="#94a3b8">
                        {['L','M','M','J','V','S','D','L'].map((d,i) => (
                          <text key={i} x={14 + i * 40} y="86">{d}</text>
                        ))}
                      </g>
                    </svg>
                  </div>

                  {/* Ships table */}
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-[.16em] font-bold pb-1 border-b" style={{ color: 'var(--navy)', borderColor: 'var(--line)' }}>
                      3 · Top navires suspects
                    </div>
                    <table className="w-full mt-2 text-[8.5px]">
                      <thead>
                        <tr className="text-left font-semibold select-none" style={{ color: 'var(--muted)' }}>
                          <th className="py-1">#</th>
                          <th className="cursor-pointer" onClick={() => handleSort('mmsi')}>MMSI{arrow('mmsi')}</th>
                          <th className="cursor-pointer" onClick={() => handleSort('ship_name')}>Navire{arrow('ship_name')}</th>
                          <th className="cursor-pointer" onClick={() => handleSort('flag')}>Pav.{arrow('flag')}</th>
                          <th className="text-right cursor-pointer" onClick={() => handleSort('score')}>Score{arrow('score')}</th>
                          <th className="text-right cursor-pointer" onClick={() => handleSort('risk_level')}>Niveau{arrow('risk_level')}</th>
                        </tr>
                      </thead>
                      <tbody className="mono">
                        {top5.length > 0 ? top5.map((s, i) => (
                          <tr key={s.mmsi} className="border-t" style={{ borderColor: 'var(--line)' }}>
                            <td className="py-1">{String(i + 1).padStart(2, '0')}</td>
                            <td>{s.mmsi}</td>
                            <td className="font-sans font-semibold">{s.ship_name || s.name || 'INCONNU'}</td>
                            <td>{s.flag}</td>
                            <td className="text-right font-bold">{(s.score ?? 0).toFixed(2)}</td>
                            <td className="text-right">
                              <span className="font-sans font-bold" style={{ color: riskColor(s.score ?? 0) }}>
                                {riskLabel(s.score ?? 0)}
                              </span>
                            </td>
                          </tr>
                        )) : (
                          [['01','273 456 789','NORDIC STAR','RUS','0.97','Ghost'],
                           ['02','422 098 765','PERSIAN PEARL','IRN','0.95','Ghost'],
                           ['03','244 710 001','KAPITAN VOLKOV','NLD','0.93','Ghost'],
                           ['04','538 009 123','BLUE HORIZON','MHL','0.86','Crit.'],
                           ['05','636 019 847','ATLAS PIONEER','LBR','0.81','Crit.'],
                          ].map(([rank, mmsi, name, flag, score, level]) => (
                            <tr key={mmsi} className="border-t" style={{ borderColor: 'var(--line)' }}>
                              <td className="py-1">{rank}</td><td>{mmsi}</td>
                              <td className="font-sans font-semibold">{name}</td><td>{flag}</td>
                              <td className="text-right font-bold">{score}</td>
                              <td className="text-right">
                                <span className="font-sans font-bold"
                                  style={{ color: level === 'Ghost' ? '#7f1d1d' : '#ef4444' }}>{level}</span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-6 left-12 right-12 flex items-center justify-between text-[7px] mono"
                  style={{ color: 'var(--muted)' }}>
                  <span>RPT-2026-W19 · DIFFUSION RESTREINTE</span>
                  <span>Page 1 / 8</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-[12px]" style={{ color: 'var(--muted)' }}>
              <span>Zoom <span className="mono font-semibold" style={{ color: 'var(--ink)' }}>75 %</span></span>
              <span>Dernière mise à jour : <span className="mono">12/05/2026 · 14:37</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-[11.5px] flex items-center justify-between" style={{ color: 'var(--muted)' }}>
        <div>Ministère des Armées · DRM · Cellule Ghost Fleet</div>
        <div className="flex items-center gap-4">
          <span>Diffusion restreinte</span><span>·</span><span>Build 2.4.1</span><span>·</span><span>© RF 2026</span>
        </div>
      </div>
    </main>
  )
}
