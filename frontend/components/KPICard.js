/**
 * KPICard — matches the HTML design system exactly.
 * Props: title, icon (JSX), value, delta, deltaGood (bool), gradient ('default'|'blue'), children
 */
export default function KPICard({ title, icon, value, delta, deltaGood = true, gradient = 'default', children }) {
  return (
    <div className={`card p-5 ${gradient === 'blue' ? 'kpi-grad-blue' : 'kpi-grad'}`}>
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>{title}</div>
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
      {children}
    </div>
  )
}
