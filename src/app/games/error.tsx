"use client";

import { useEffect } from "react";
import Card from "@/components/ui/Card";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Games route error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center py-20">
      <Card className="text-center max-w-md" role="alert">
        <h2 className="text-white text-xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-blue-200 text-sm mb-6">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 border border-[#1C598C] rounded text-cyan-400 hover:text-white hover:bg-cyan-400/10 transition-colors"
        >
          Try again
        </button>
      </Card>
    </div>
  );
}
