export default function LoadingSpinner({ label = "Loading arena…" }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-primary/15" />
        <div className="w-12 h-12 rounded-full border-2 border-transparent border-t-primary border-r-primary/40 animate-spin absolute inset-0" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        </div>
      </div>
      <p className="section-label">{label}</p>
    </div>
  );
}
