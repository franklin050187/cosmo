import type { Metadata } from "next";
import UploadPanel from "@/components/upload/UploadPanel";
import RequireAuth from "@/components/RequireAuth";

export const metadata: Metadata = {
  title: "Upload Ship - CosmoShip",
  description: "Upload your Cosmoteer ship blueprint to the community library.",
};

export default function UploadPage() {
  return (
    <RequireAuth>
      <div>
        <h1 className="text-4xl text-white text-center uppercase mb-8">
          Upload a Ship
        </h1>
        <UploadPanel />
      </div>
    </RequireAuth>
  );
}
