import { useState } from 'react'
import { RiskChip } from './ui/RiskChip'

function RiskBadge({ value }) {
  return <RiskChip level={value ?? 'Normal'} />
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

  const MONO_KEYS = new Set(['mmsi','score','latitude','longitude','speed','course','confidence','isolation_score','behavior_score','graph_degree','route_sim_score','zone_score'])

  if (!ships.length) {
    return (
      <div className="bg-white border border-[#e5ebf2] rounded-[14px] p-8 text-center text-[#64748b]">
        Aucun navire à afficher. Lancez le pipeline Python pour alimenter la base.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-[14px] border border-[#e5ebf2] shadow-card">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[#e5ebf2]">
            {defaultColumns.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="text-[10.5px] font-bold uppercase tracking-widest text-[#64748b] pb-3 pt-3 px-4 text-left cursor-pointer hover:text-[#1e3a5f] select-none whitespace-nowrap"
              >
                {col.label}
                {sortKey === col.key && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {sorted.map((ship, i) => (
            <tr key={ship.mmsi ?? i} className="border-b border-[#e5ebf2] hover:bg-[#eef2f7] transition-colors">
              {defaultColumns.map(col => (
                <td
                  key={col.key}
                  className={`px-4 py-3 whitespace-nowrap ${MONO_KEYS.has(col.key) ? 'font-mono font-tabular text-[12px]' : ''}`}
                >
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
