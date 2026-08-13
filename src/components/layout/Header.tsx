"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

const NAV_LINKS = [
  { href: "/", label: "Ships" },
  { href: "/collections", label: "Collections" },
  { href: "/upload", label: "Upload" },
];

const USER_MENU_LINKS = [
  { href: "/my-ships", label: "My Ships" },
  { href: "/favorites", label: "My Favorites" },
  { href: "/my-collections", label: "My Collections" },
  { href: "/about", label: "About" },
];

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Login was cancelled.",
  no_code: "Login failed — no authorization code received.",
  token_exchange_failed: "Login failed — could not verify with Discord.",
  user_fetch_failed: "Login failed — could not fetch Discord profile.",
  csrf_failed: "Login failed — session expired. Please try again.",
  auth_failed: "Login failed. Please try again.",
};

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = pathname + (searchParams.toString() ? `?${searchParams}` : "");
  const menuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { user, hydrated, logout } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetch("/api/auth/is-admin", { signal: controller.signal })
      .then((r) => r.json())
      .then((d: { data: { isAdmin: boolean } }) => setIsAdmin(d.data?.isAdmin ?? false))
      .catch(() => setIsAdmin(false));
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    const id = setTimeout(() => {
      const error = new URLSearchParams(window.location.search).get("auth_error");
      if (error) {
        window.history.replaceState({}, "", window.location.pathname + window.location.hash);
        setAuthErrorCode(error);
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const authError = authErrorCode && !dismissed ? (AUTH_ERROR_MESSAGES[authErrorCode] || "Login failed. Please try again.") : null;

  useEffect(() => {
    if (!authError) return;
    const timer = setTimeout(() => setDismissed(true), 15000);
    return () => clearTimeout(timer);
  }, [authError]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  const handleLogout = async () => {
    await logout();
    setUserMenuOpen(false);
    setMenuOpen(false);
    window.location.href = "/";
  };

  return (
    <>
    <header className="fixed top-0 inset-x-0 z-20 bg-[#021526]/80 backdrop-blur-md border-b border-[#1C598C]/50">
      <div className="max-w-[1360px] mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="shrink-0" aria-label="CosmoShip Home">
          <Image alt="" src="/logo-v2.svg" width={400} height={98} priority className="h-8 w-auto" style={{ width: "auto" }} />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 text-sm text-blue-200/80 hover:text-white rounded-md hover:bg-white/5 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Desktop: user dropdown or login */}
          <div className="hidden md:block">
            {hydrated && user ? (
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  aria-label="User menu"
                >
                  {user.avatar && (
                    <Image src={user.avatar} alt="" width={24} height={24} className="w-6 h-6 rounded-full" />
                  )}
                  <span className="text-sm text-blue-200">{user.username}</span>
                  <svg className={`w-3 h-3 text-blue-300 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-[#021526] border border-[#1C598C] rounded-md shadow-lg z-50 py-1" role="menu">
                    {USER_MENU_LINKS.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-blue-200 hover:text-white hover:bg-white/5 transition-colors"
                        role="menuitem"
                      >
                        {link.label}
                      </Link>
                    ))}
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-amber-400 hover:text-amber-300 hover:bg-white/5 transition-colors"
                        role="menuitem"
                      >
                        Analytics
                      </Link>
                    )}
                    <div className="border-t border-[#1C598C]/30 my-1" />
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                      role="menuitem"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : hydrated ? (
              <Link
                href={`/auth/discord?returnTo=${encodeURIComponent(returnTo)}`}
                className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Login with Discord
              </Link>
            ) : null}
          </div>

          {/* Mobile burger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden relative w-8 h-8 flex items-center justify-center"
            aria-label="Menu"
          >
            <span
              className={`absolute w-5 h-0.5 bg-cyan-400 rounded transition-all duration-200 ${
                menuOpen ? "rotate-45" : "-translate-y-1.5"
              }`}
            />
            <span
              className={`absolute w-5 h-0.5 bg-cyan-400 rounded transition-all duration-200 ${
                menuOpen ? "opacity-0 scale-0" : ""
              }`}
            />
            <span
              className={`absolute w-5 h-0.5 bg-cyan-400 rounded transition-all duration-200 ${
                menuOpen ? "-rotate-45" : "translate-y-1.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      <div
        ref={menuRef}
        className={`md:hidden overflow-hidden transition-all duration-200 ${
          menuOpen ? "max-h-[40rem]" : "max-h-0"
        }`}
      >
        <nav className="bg-[#021526] border-t border-[#1C598C]/30 px-4 py-3 space-y-1" aria-label="Mobile navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2.5 text-sm text-blue-200/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              {link.label}
            </Link>
          ))}
          {hydrated && user && (
            <>
              <div className="border-t border-[#1C598C]/20 mt-2 pt-2">
                {USER_MENU_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2.5 text-sm text-blue-200/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="border-t border-[#1C598C]/20 mt-2 pt-2">
                <div className="flex items-center gap-2 px-3 py-2">
                  {user.avatar && (
                    <Image src={user.avatar} alt="" width={20} height={20} className="w-5 h-5 rounded-full" />
                  )}
                  <span className="text-sm text-blue-200">{user.username}</span>
                </div>
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2.5 text-sm text-amber-400 hover:text-amber-300 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    Analytics
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  Logout
                </button>
              </div>
            </>
          )}
          {hydrated && !user && (
            <div className="border-t border-[#1C598C]/20 mt-2 pt-2">
              <Link
                href={`/auth/discord?returnTo=${encodeURIComponent(returnTo)}`}
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2.5 text-sm text-cyan-400 hover:text-cyan-300 hover:bg-white/5 rounded-lg transition-colors"
              >
                Login with Discord
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
    {authError && (
      <div className="fixed top-14 inset-x-0 z-20 flex justify-center px-4">
        <div className="flex items-center gap-3 bg-red-900/80 border border-red-500/40 backdrop-blur-md text-red-200 text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in" role="alert">
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {authError}
          <button onClick={() => setDismissed(true)} className="ml-2 text-red-400 hover:text-white" aria-label="Dismiss">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    )}
    </>
  );
}
