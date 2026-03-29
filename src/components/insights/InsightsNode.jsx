/**
 * High-density stat tile (Esports Charts–style).
 * @param {{ label: string, value: React.ReactNode, trend?: string|number|null, icon?: import('lucide-react').LucideIcon, sub?: string }} props
 */
export default function InsightsNode({ label, value, trend = null, icon: Icon, sub }) {
  return (
    <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] transition-all">
      <div className="flex justify-between items-start mb-2">
        {Icon ? (
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        ) : (
          <span />
        )}
        {trend != null && trend !== "" && Number(trend) !== 0 && (
          <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            +{trend}%
          </span>
        )}
      </div>
      <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-none mb-1">{label}</p>
      <p className="text-2xl font-black italic uppercase tracking-tighter text-white">{value}</p>
      {sub ? <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">{sub}</p> : null}
    </div>
  );
}
