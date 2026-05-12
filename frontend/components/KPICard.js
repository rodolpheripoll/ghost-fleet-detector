/**
 * KPICard — matches the HTML design system exactly.
 * Props: title, icon (JSX), value, delta, deltaGood (bool), gradient ('default'|'blue'), children
 * Also accepts: label (alias for title), subtitle/sub (shown as muted text below value)
 */
export default function KPICard({ title, label, icon, value, delta, deltaGood = true, gradient = 'default', subtitle, sub, children }) {
  const heading = label ?? title
  const note    = sub ?? subtitle
  return (
    <div className={`card p-5 ${gradient === 'blue' ? 'kpi-grad-blue' : 'kpi-grad'}`}>
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>{heading}</div>
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-white ring-soft flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-end gap-3">
        <div className="text-[36px] font-bold tracking-tight leading-none">{value ?? '—'}</div>
        {delta && (
          <span className={`chip mb-1 ${deltaGood ? 'risk-normal' : 'risk-suspect'}`}>{delta}</span>
        )}
      </div>
      {note && <p className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>{note}</p>}
      {children}
    </div>
  )
}
