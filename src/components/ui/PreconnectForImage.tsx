"use client";

import { useEffect } from "react";
import { getImageHost } from "@/lib/image-host";

const ALREADY_PRECONNECTED = new Set(["i.ibb.co", "ufs.sh"]);

export default function PreconnectForImage({ src }: { src: string }) {
  useEffect(() => {
    const host = getImageHost(src);
    if (!host || ALREADY_PRECONNECTED.has(host)) return;

    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = `https://${host}`;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);

    return () => {
      if (document.head.contains(link)) document.head.removeChild(link);
    };
  }, [src]);

  return null;
}
