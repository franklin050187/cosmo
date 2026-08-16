import { genUploader } from "uploadthing/client";

const UPLOADTHING_SERVER_URL = "/api/uploadthing";

const { uploadFiles: utUpload } = genUploader({
  url: UPLOADTHING_SERVER_URL,
});

export interface UploadProgress {
  file: File;
  progress: number;
  loaded: number;
  totalLoaded: number;
  totalProgress: number;
}

export async function uploadFiles(opts: {
  files: File[];
  description?: string;
  brand?: string;
  tags?: string[];
  turnstileToken?: string;
  endpoint?: string;
  shipId?: number;
  onUploadProgress?: (p: UploadProgress) => void;
}) {
  const headers: Record<string, string> = {};
  if (opts.description) {
    headers["x-description"] = opts.description;
  }
  if (opts.brand) {
    headers["x-brand"] = opts.brand;
  }
  if (opts.tags && opts.tags.length > 0) {
    headers["x-tags"] = JSON.stringify(opts.tags);
  }
  if (opts.turnstileToken) {
    headers["x-turnstile-token"] = opts.turnstileToken;
  }
  if (opts.shipId) {
    headers["x-ship-id"] = String(opts.shipId);
  }
  const results = await utUpload(opts.endpoint ?? "pngUploader", {
    files: opts.files,
    headers,
    onUploadProgress: opts.onUploadProgress,
  });
  return results.map((r) => ({
    ufsUrl: r.ufsUrl,
    shipId: (r as unknown as Record<string, unknown>).serverData as { shipId: number | null } | undefined,
  }));
}
