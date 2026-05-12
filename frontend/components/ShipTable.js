import { useState } from 'react'

function RiskBadge({ value }) {
  const v = value ?? 'Normal'
  const cls =
    v === 'Ghost Fleet' ? 'bg-[#ede9fe] text-[#7c3aed]' :
    v === 'Critical'    ? 'bg-[#fee2e2] text-[#dc2626]' :
    v === 'Suspect'     ? 'bg-[#fef3c7] text-[#d97706]' :
                          'bg-[#dcfce7] text-[#16a34a]'
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{v}</span>
}

/**
 * ShipTable — light theme
 * Props:
 *   ships    {Array}   — array of ship objects from Supabase
 *   columns  {Array}   — [{ key, label, render? }]
 */
export default function ShipTable({ ships = [], columns }) {
  const [sortKey, setSortKey] = useState('score')
  const [sortDir, setSortDir] = useState('desc')

  const defaultColumns = columns || [
    { key: 'mmsi',       label: 'MMSI' },
    { key: 'risk_level', label: 'Risque',    render: v => <RiskBadge value={v} /> },
    { key: 'score',      label: 'Score',     render: v => (parseFloat(v) || 0).toFixed(2) },
    { key: 'latitude',   label: 'Lat',       render: v => v?.toFixed(4) ?? 'N/A' },
    { key: 'longitude',  label: 'Lon',       render: v => v?.toFixed(4) ?? 'N/A' },
    { key: 'speed',      label: 'Vitesse',   render: v => v != null ? `${v} kn` : 'N/A' },
    { key: 'timestamp',  label: 'Timestamp', render: v => v ? new Date(v).toLocaleString('fr-FR') : 'N/A' },
  ]

  const handleSort = (key) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...ships].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  if (!ships.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-[#64748b]">
        Aucun navire à afficher. Lancez le pipeline Python pour alimenter la base.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-sm text-[#0f172a]">
        <thead className="bg-slate-50 text-[#64748b] uppercase text-xs border-b border-slate-200">
          <tr>
            {defaultColumns.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-4 py-3 text-left cursor-pointer hover:text-[#0f172a] select-none whitespace-nowrap"
              >
                {col.label}
                {sortKey === col.key && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {sorted.map((ship, i) => (
            <tr
              key={ship.mmsi ?? i}
              className="border-t border-slate-100 hover:bg-[#f0f9ff] transition-colors"
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
