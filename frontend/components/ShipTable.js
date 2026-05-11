import { useState } from 'react'

/**
 * Score badge: colour depends on risk level
 *   0.0 – 0.3  green
 *   0.3 – 0.6  orange / amber
 *   0.6 – 0.8  red
 *   0.8 – 1.0  dark red
 */
function ScoreBadge({ score }) {
  const s = parseFloat(score) || 0
  let cls = 'bg-emerald-900 text-emerald-300'
  if (s >= 0.8) cls = 'bg-red-950 text-red-300'
  else if (s >= 0.6) cls = 'bg-red-900 text-red-300'
  else if (s >= 0.3) cls = 'bg-amber-900 text-amber-300'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${cls}`}>
      {s.toFixed(2)}
    </span>
  )
}

/**
 * ShipTable
 * Props:
 *   ships    {Array}   — array of ship objects from Supabase
 *   columns  {Array}   — [{ key, label, render? }]
 */
export default function ShipTable({ ships = [], columns }) {
  const [sortKey, setSortKey]   = useState('score')
  const [sortDir, setSortDir]   = useState('desc')

  const defaultColumns = columns || [
    { key: 'mmsi',       label: 'MMSI'          },
    { key: 'score',      label: 'Score',   render: (v) => <ScoreBadge score={v} /> },
    { key: 'risk_level', label: 'Risque'        },
    { key: 'latitude',   label: 'Lat',     render: (v) => v?.toFixed(4) ?? 'N/A' },
    { key: 'longitude',  label: 'Lon',     render: (v) => v?.toFixed(4) ?? 'N/A' },
    { key: 'speed',      label: 'Vitesse', render: (v) => v != null ? `${v} kn` : 'N/A' },
    { key: 'timestamp',  label: 'Timestamp',    render: (v) => v ? new Date(v).toLocaleString('fr-FR') : 'N/A' },
  ]

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...ships].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  if (!ships.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-400">
        Aucun navire a afficher. Lancez le pipeline Python pour alimenter la base.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-sm text-slate-300">
        <thead className="bg-slate-900 text-slate-400 uppercase text-xs">
          <tr>
            {defaultColumns.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-4 py-3 text-left cursor-pointer hover:text-white select-none whitespace-nowrap"
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((ship, i) => (
            <tr
              key={ship.mmsi ?? i}
              className="border-t border-slate-700 hover:bg-slate-700 transition-colors"
            >
              {defaultColumns.map(col => (
                <td key={col.key} className="px-4 py-2.5 whitespace-nowrap">
                  {col.render ? col.render(ship[col.key]) : (ship[col.key] ?? 'N/A')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
