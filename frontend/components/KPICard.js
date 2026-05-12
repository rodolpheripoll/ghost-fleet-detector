/**
 * KPICard — light theme
 * Props:
 *   title    {string}  — label above the value
 *   value    {string|number}
 *   color    {string}  — hex color for the left border and number
 *   subtitle {string}  — small descriptive text below the value
 */
export default function KPICard({ title, value, color = '#0ea5e9', subtitle }) {
  return (
    <div
      className="bg-white rounded-xl p-5 flex flex-col gap-2 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="text-[#64748b] text-sm font-medium uppercase tracking-wide">
        {title}
      </div>
      <div className="text-4xl font-bold" style={{ color }}>
        {value ?? '—'}
      </div>
      {subtitle && (
        <div className="text-[#64748b] text-xs">{subtitle}</div>
      )}
    </div>
  )
}
