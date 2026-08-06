import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="text-6xl text-white font-bold mb-4">404</h1>
      <p className="text-blue-200 text-lg mb-6">Page not found</p>
      <Link
        href="/"
        className="px-4 py-2 border border-[#1C598C] rounded text-cyan-400 hover:text-white hover:bg-cyan-400/10 transition-colors"
      >
        Back to home
      </Link>
    </div>
  );
}