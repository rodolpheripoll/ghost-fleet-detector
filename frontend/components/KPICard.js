/**
 * KPICard
 * Props:
 *   title    {string}  — label above the value
 *   value    {string|number}
 *   color    {string}  — Tailwind text-color class, e.g. 'text-emerald-400'
 *   icon     {string}  — emoji or single character
 *   subtitle {string}  — small descriptive text below the value
 */
export default function KPICard({ title, value, color = 'text-white', icon, subtitle }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-2 shadow">
      <div className="flex items-center gap-2 text-slate-400 text-sm font-medium uppercase tracking-wide">
        {icon && <span className="text-base">{icon}</span>}
        {title}
      </div>
      <div className={`text-4xl font-bold ${color}`}>
        {value ?? '—'}
      </div>
      {subtitle && (
        <div className="text-slate-500 text-xs">{subtitle}</div>
      )}
    </div>
  )
}
