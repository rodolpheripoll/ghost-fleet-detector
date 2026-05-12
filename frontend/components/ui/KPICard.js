export function KPICard({ label, value, sub, hero = false }) {
  return (
    <div
      style={hero ? { background: 'linear-gradient(135deg, #f5f8fd, #eaf1fb)' } : {}}
      className="bg-white border border-[#e5ebf2] rounded-[14px] shadow-card p-5"
    >
      <p className="text-[10.5px] font-bold uppercase tracking-widest text-[#64748b] mb-2">{label}</p>
      <p className="font-mono font-tabular text-[32px] font-extrabold text-[#1e3a5f] leading-none">{value ?? '—'}</p>
      {sub && <p className="text-[12px] text-[#64748b] mt-1.5">{sub}</p>}
    </div>
  )
}
