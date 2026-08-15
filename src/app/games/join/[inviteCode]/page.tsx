"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import type { GameDetail } from "@/lib/types";
import { sanitizeHtml } from "@/lib/sanitize";
import { formatDate, formatDateTime } from "@/lib/format-date";

const MODE_LABELS: Record<string, string> = { pvp: "PvP", tournament: "Tournament", campaign: "Campaign" };

export default function GameJoinPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const inviteCode = String(params.inviteCode);
  const [game, setGame] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [regWindowOpen, setRegWindowOpen] = useState(true);

  const computeRegWindowOpen = (g: GameDetail): boolean => {
    const now = Date.now();
    if (g.register_open_at && now < new Date(g.register_open_at).getTime()) return false;
    if (g.register_close_at && now > new Date(g.register_close_at).getTime()) return false;
    return true;
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch(`/api/games/by-invite/${inviteCode}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Not found");
        const json = await res.json();
        return json.data ?? json;
      })
      .then((data: GameDetail) => {
        if (!active) return;
        setGame(data);
        setRegWindowOpen(computeRegWindowOpen(data));
        document.title = `Join ${data.title} - CosmoShip`;
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [inviteCode]);

  const membership = game
    ? game.participants.some(
        (p) =>
          (p.discord_id && p.discord_id === user?.id) ||
          (p.discord_username && p.discord_username.toLowerCase() === user?.username?.toLowerCase()),
      )
    : false;

  const memberGuestMatch = guestName
    ? game?.participants.some((p) => p.discord_username.toLowerCase() === guestName.toLowerCase())
    : false;

  const registerable = game?.status === "open" && regWindowOpen;

  const register = async () => {
    if (!game) return;
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { invite_code: inviteCode };
      if (!isLoggedIn) body.username = guestName.trim();
      const res = await fetch(`/api/games/${game.id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setMsg(json.error ?? "Failed to register");
        return;
      }
      setMsg("Registered! Redirecting to the game...");
      setTimeout(() => router.push(`/games/${game.id}`), 800);
    } catch {
      setMsg("Failed to register");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-center text-blue-200" role="status">Loading...</p>;
  if (notFound || !game) return <p className="text-center text-red-400">Invite link not found</p>;

  return (
    <div className="max-w-lg mx-auto text-center">
      <h1 className="text-3xl text-white uppercase mb-2">{game.title}</h1>
      <p className="text-blue-200 text-sm mb-6">
        by {game.owner_name} · {MODE_LABELS[game.game_mode] ?? game.game_mode} ·{" "}
        {game.participants.length} player{game.participants.length === 1 ? "" : "s"}
      </p>

      <p className="text-cyan-300 text-sm mb-6">Game day: {formatDateTime(game.game_date)}</p>

      {game.description && (
        <div className="text-white text-sm mb-6 text-left" dangerouslySetInnerHTML={{ __html: sanitizeHtml(game.description) }} />
      )}

      <Card className="space-y-4 mb-6">
        {game.visibility === "private" ? (
          <p className="text-amber-300 text-sm">This is a private game — you were invited.</p>
        ) : (
          <p className="text-blue-200 text-sm">Join this public game.</p>
        )}

        {isLoggedIn ? (
          membership ? (
            <p className="text-cyan-400 text-sm">You are already registered.</p>
          ) : registerable ? (
            <Button onClick={register} disabled={busy}>
              {busy ? "Registering..." : "Register"}
            </Button>
          ) : (
            <p className="text-amber-300 text-sm">Registrations are currently closed for this game.</p>
          )
        ) : registerable ? (
          <div className="space-y-2">
            <p className="text-blue-200 text-sm">
              Register with your Discord username (name#disc or username).
            </p>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Discord username"
              className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white text-sm"
            />
            {memberGuestMatch ? (
              <p className="text-cyan-400 text-sm">That username is already registered.</p>
            ) : (
              <Button onClick={register} disabled={busy || !guestName.trim()}>
                {busy ? "Registering..." : "Register"}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-amber-300 text-sm">Registrations are currently closed for this game.</p>
        )}

        {msg && <p className="text-cyan-400 text-sm" role="status">{msg}</p>}

        <Link href={`/games/${game.id}`} className="inline-block text-sm text-blue-300 hover:text-cyan-300 transition-colors">
          View game details
        </Link>
      </Card>

      <p className="text-gray-500 text-xs">Created {formatDate(game.created_at)}</p>
    </div>
  );
}