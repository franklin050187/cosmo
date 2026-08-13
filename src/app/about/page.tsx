import Card from "@/components/ui/Card";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About - CosmoShip",
  description: "Learn about CosmoShip, the community ship library for Cosmoteer: Starship Architect & Commander.",
};

export default function AboutPage() {
  return (
    <div>
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        About CosmoShip
      </h1>

      <Card className="p-6">
        <p className="text-white mb-4">
          CosmoShip is a community library for sharing ship designs in{" "}
          <a
            href="https://store.steampowered.com/app/798090/Cosmoteer_Starship_Architect_Commander/"
            className="text-cyan-400 underline"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Cosmoteer: Starship Architect & Commander (opens in new tab)"
          >
            Cosmoteer: Starship Architect & Commander
          </a>
        </p>

        <p className="text-white mb-4">
          Upload your ship blueprints, browse community designs, and discover new
          strategies for building the ultimate starship.
        </p>

        <p className="text-white mb-4">
          All ships posted are under the{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            className="text-cyan-400 underline"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="CC BY 4.0 (opens in new tab)"
          >
            CC BY 4.0
          </a>{" "}
          license unless stated otherwise in the description.
        </p>

        <h2 className="text-2xl text-white mt-8 mb-4">Features</h2>
        <ul className="text-white list-disc list-inside space-y-2">
          <li>Upload ship blueprints hidden in PNG images</li>
          <li>Automatic price and crew calculation</li>
          <li>Search by tags, author, price range, and more</li>
          <li>Download and use community ships</li>
          <li>Add ships to your favorites collection</li>
        </ul>
      </Card>
    </div>
  );
}
