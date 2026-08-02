import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full border-t border-[#1C598C] bg-black fixed bottom-0 left-0 z-10">
      <div className="max-w-[1360px] mx-auto px-4 h-10 flex items-center justify-between">
        <img
          loading="lazy"
          alt="Excelsior logo"
          src="/excelsior-logo.webp"
          className="h-5 w-auto"
        />
        <ul className="flex items-center gap-3">
          <li>
            <Link
              href="https://github.com/franklin050187/cosmo"
              className="text-white text-xs hover:border-b hover:border-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
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
            >
              Issues
            </Link>
          </li>
          <li>
            <Link
              href="/game"
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
