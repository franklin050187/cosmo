export default function Loading() {
  return (
    <div className="flex items-center justify-center py-20" role="status" aria-label="Loading">
      <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  );
}
