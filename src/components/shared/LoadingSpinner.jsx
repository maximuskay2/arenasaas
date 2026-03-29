export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="relative">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20" />
        <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-primary animate-spin absolute inset-0" />
      </div>
    </div>
  );
}