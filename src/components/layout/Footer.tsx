import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="w-full border-t border-[#1C598C] bg-black fixed bottom-0 left-0 z-10">
      <div className="max-w-[1360px] mx-auto px-4 h-10 flex items-center justify-between">
        <Image
          loading="lazy"
          alt="Excelsior logo"
          src="/excelsior-logo.webp"
          width={240}
          height={60}
          className="h-5 w-auto"
        />
        <ul className="flex items-center gap-3">
          <li>
            <Link
              href="https://github.com/franklin050187/cosmo"
              className="text-white text-xs hover:border-b hover:border-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Source code (opens in new tab)"
            >
              Source code
            </Link>
          </li>
          <li>
            <Link
              href="https://github.com/franklin050187/cosmo/issues"
              className="text-white text-xs hover:border-b hover:border-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Issues (opens in new tab)"
            >
              Issues
            </Link>
          </li>
          <li>
            <Link
              href="/about-game"
              className="text-white text-xs hover:border-b hover:border-white transition-colors"
            >
              About the Game
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
