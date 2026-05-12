const CHIP = {
  Normal:       { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', dot: '#22c55e' },
  Suspect:      { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', dot: '#f97316' },
  Critical:     { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', dot: '#ef4444' },
  'Ghost Fleet':{ bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d', dot: '#7f1d1d' },
  High:         { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', dot: '#f97316' },
  Medium:       { bg: '#fefce8', border: '#fde68a', text: '#854d0e', dot: '#eab308' },
  Low:          { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', dot: '#22c55e' },
}

export function RiskChip({ level }) {
  const c = CHIP[level] ?? CHIP.Normal
  return (
    <span
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
    >
      <span style={{ background: c.dot, width: 7, height: 7, borderRadius: '50%', flexShrink: 0 }} />
      {level}
    </span>
  )
}
