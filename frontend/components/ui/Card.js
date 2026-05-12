export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white border border-[#e5ebf2] rounded-[14px] shadow-card ${className}`}>
      {children}
    </div>
  )
}
