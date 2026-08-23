"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import DebugShipTool from "@/components/debug/DebugShipTool";

export default function DebugPage() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      router.replace("/");
    }
  }, [router]);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        Debug Ship Blueprint
      </h1>
      <DebugShipTool />
    </div>
  );
}
