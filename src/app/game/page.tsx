import Card from "@/components/ui/Card";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Cosmoteer - CosmoShip",
  description:
    "Learn about Cosmoteer: Starship Architect & Commander, the ship-building strategy game by Walternate Realities. Design starships, command real-time tactical battles, and share your creations.",
};

const externalLinks = [
  { href: "https://cosmoteer.net/", label: "Official website" },
  { href: "https://discord.gg/cosmoteer", label: "Official Discord" },
  { href: "https://store.steampowered.com/app/799600/Cosmoteer_Starship_Architect__Commander/", label: "Steam page" },
  { href: "https://cosmoteer.wiki.gg/wiki/Cosmoteer_Wiki", label: "Official Wiki" },
] as const;

export default function GamePage() {
  return (
    <div>
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        About Cosmoteer: Starship Architect & Commander
      </h1>

      <p className="text-center text-blue-200 mb-6">
        Check the official website:{" "}
        <a
          href="https://cosmoteer.net/"
          className="text-cyan-400 underline hover:text-cyan-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          cosmoteer.net
        </a>
      </p>

      <Card className="p-6 space-y-6">
        <section>
          <h2 className="text-2xl text-white font-semibold mb-3">The Game</h2>
          <p className="text-white/80 leading-relaxed">
            Create and pilot the starship of your dreams! Take command in epic
            battles, manage your crew, and explore a perilous galaxy. Play solo
            or with friends, test your ship in online PvP, and let your
            imagination soar to the stars.
          </p>
        </section>

        <section>
          <h2 className="text-2xl text-white font-semibold mb-3">Design Starship</h2>
          <p className="text-white/80 leading-relaxed">
            Design incredible starships with intuitive creation tools that are
            easy to learn yet challenging to master. Fully customize your
            ship&apos;s shape and layout, placing individual modules like weapons,
            engines, hallways, and crew quarters wherever you choose. Your
            ship&apos;s design is crucial to its survival, and every decision
            affects its performance in battle. Easily share your creations
            through the Steam Workshop, forums, and Discord.
          </p>
        </section>

        <section>
          <h2 className="text-2xl text-white font-semibold mb-3">Real-Time Tactical Battles</h2>
          <p className="text-white/80 leading-relaxed">
            Command your ship or fleet in real-time tactical battles.
            Experience physics-driven, explosive, and immensely satisfying
            combat. Each module can be individually targeted and destroyed,
            with entire ships capable of breaking apart into multiple pieces.
            Disable an enemy&apos;s weapons to nullify its attack, destroy its
            shields to weaken its defenses, or deliver a decisive blow by
            taking out its reactor.
          </p>
        </section>

        <section>
          <h2 className="text-2xl text-white font-semibold mb-3">Links</h2>
          <ul className="space-y-1.5">
            {externalLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-cyan-400 underline hover:text-cyan-300"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div className="text-center pt-6 border-t border-[#1C598C]/30">
          <Link
            href="/"
            className="inline-block px-6 py-3 border border-[#1C598C] rounded bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white transition-colors font-medium"
          >
            Browse Community Ships
          </Link>
        </div>
      </Card>
    </div>
  );
}
