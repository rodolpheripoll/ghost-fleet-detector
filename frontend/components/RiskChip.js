const RISK = {
  'Ghost Fleet': { cls: 'risk-ghost',    dot: '#7f1d1d' },
  'Critical':    { cls: 'risk-critical', dot: '#ef4444' },
  'Suspect':     { cls: 'risk-suspect',  dot: '#f97316' },
  'Normal':      { cls: 'risk-normal',   dot: '#22c55e' },
}

export default function RiskChip({ level }) {
  const { cls, dot } = RISK[level] || RISK['Normal']
  return (
    <span className={`chip ${cls}`}>
      <span className="dot" style={{ background: dot }} />
      {level || 'Normal'}
    </span>
  )
}
