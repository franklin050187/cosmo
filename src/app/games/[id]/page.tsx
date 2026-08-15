"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import RichTextEditor from "@/components/ui/RichTextEditor";
import TurnstileWidget from "@/components/TurnstileWidget";
import type { TurnstileWidgetHandle } from "@/components/TurnstileWidget";
import Bracket from "@/components/games/Bracket";
import CollectionSelect from "@/components/games/CollectionSelect";
import { useAuth } from "@/hooks/useAuth";
import { type GameDetail, type GameMode, type GameStatus, type GameVisibility } from "@/lib/types";
import { trackEvent } from "@/lib/analytics-client";
import { sanitizeHtml } from "@/lib/sanitize";
import { formatDate, formatDateTime, toDatetimeLocal, fromDatetimeLocal } from "@/lib/format-date";

const MODE_LABELS: Record<string, string> = { pvp: "PvP", tournament: "Tournament", campaign: "Campaign" };
const STATUS_LABELS: Record<string, string> = { open: "Open", closed: "Closed", finished: "Finished" };

function sameIdentity(a: { discord_id: string | null; discord_username: string }, user: { id: string; username: string } | null) {
  if (user) {
    if (a.discord_id && a.discord_id === user.id) return true;
    if (a.discord_username.toLowerCase() === user.username.toLowerCase()) return true;
  }
  return false;
}

export default function GameDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();

  const [game, setGame] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMode, setEditMode] = useState<GameMode>("pvp");
  const [editVisibility, setEditVisibility] = useState<GameVisibility>("public");
  const [editStatus, setEditStatus] = useState<GameStatus>("open");
  const [editCollectionId, setEditCollectionId] = useState("");
  const [editGameDate, setEditGameDate] = useState("");
  const [editRegOpen, setEditRegOpen] = useState("");
  const [editRegClose, setEditRegClose] = useState("");
  const [editRoulette, setEditRoulette] = useState(false);
  const editTurnstileRef = useRef<TurnstileWidgetHandle>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  const [shuffle, setShuffle] = useState(true);
  const [bracketBusy, setBracketBusy] = useState(false);
  const [rouletteBusy, setRouletteBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [regStatus, setRegStatus] = useState<"open" | "not_open" | "closed">("open");

  const computeRegStatus = (g: GameDetail): "open" | "not_open" | "closed" => {
    const now = Date.now();
    const openAt = g.register_open_at ? new Date(g.register_open_at).getTime() : null;
    const closeAt = g.register_close_at ? new Date(g.register_close_at).getTime() : null;
    if (openAt && now < openAt) return "not_open";
    if (closeAt && now > closeAt) return "closed";
    return "open";
  };

  const load = () => {
    return fetch(`/api/games/${params.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Not found");
        const json = await res.json();
        return json.data ?? json;
      })
      .then((data: GameDetail) => {
        setRegStatus(computeRegStatus(data));
        return data;
      });
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    load()
      .then((data: GameDetail) => {
        if (!active) return;
        setOrigin(window.location.origin);
        setGame(data);
        document.title = `${data.title} - CosmoShip`;
        const own =
          !!(data.owner_discord_id && data.owner_discord_id === user?.id) ||
          (!!user && !data.owner_discord_id && data.owner_name === user.username);
        setIsOwner(own);
        if (own) {
          setEditTitle(data.title);
          setEditDescription(data.description);
          setEditMode(data.game_mode);
          setEditVisibility(data.visibility);
          setEditStatus(data.status);
          setEditCollectionId(data.collection_id != null ? String(data.collection_id) : "");
          setEditGameDate(toDatetimeLocal(new Date(data.game_date)));
          setEditRegOpen(data.register_open_at ? toDatetimeLocal(new Date(data.register_open_at)) : "");
          setEditRegClose(data.register_close_at ? toDatetimeLocal(new Date(data.register_close_at)) : "");
          setEditRoulette(data.roulette_enabled);
        }
        trackEvent("game_view");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, user?.id, user?.username]);

  const showMsg = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(null), 3000);
  };

  const membership = game ? game.participants.some((p) => sameIdentity(p, user)) : false;
  const memberGuestMatch = guestName
    ? game?.participants.some((p) => p.discord_username.toLowerCase() === guestName.toLowerCase())
    : false;

  const canRegister = game?.status === "open" && regStatus === "open";

  const register = async (opts?: { username?: string }) => {
    if (!game) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/games/${game.id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: opts?.username, invite_code: inviteCode.trim() || undefined, ...(opts ? {} : {}) }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setMsg(json.error ?? "Failed to register");
        return;
      }
      showMsg(json.data?.success ?? "Registered");
      trackEvent("game_register");
      setGame(await load());
    } catch {
      setMsg("Failed to register");
    } finally {
      setBusy(false);
    }
  };

  const leave = async (opts?: { username?: string }) => {
    if (!game) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/games/${game.id}/register`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: opts?.username ? JSON.stringify({ username: opts.username }) : undefined,
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setMsg(json.error ?? "Failed to leave");
        return;
      }
      showMsg(json.data?.warning ?? "Left game");
      setGame(await load());
    } catch {
      setMsg("Failed to leave");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = () => {
    if (!game) return;
    const url = `${window.location.origin}/games/join/${game.invite_code}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => showMsg("Could not copy link"));
  };

  const saveEdit = async () => {
    if (!game) return;
    const turnstileToken = editTurnstileRef.current?.getToken();
    if (!turnstileToken) {
      setMsg("Please complete the Turnstile captcha.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const gameDateIso = fromDatetimeLocal(editGameDate);
    if (!gameDateIso) {
      setMsg("Day of the game is required.");
      setBusy(false);
      return;
    }
    const regOpenIso = fromDatetimeLocal(editRegOpen);
    const regCloseIso = fromDatetimeLocal(editRegClose);
    if (regOpenIso && regCloseIso && new Date(regOpenIso) > new Date(regCloseIso)) {
      setMsg("Registration window ends before it starts.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/games/${game.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          game_mode: editMode,
          visibility: editVisibility,
          status: editStatus,
          collection_id: editCollectionId ? parseInt(editCollectionId, 10) : null,
          game_date: gameDateIso,
          register_open_at: regOpenIso,
          register_close_at: regCloseIso,
          roulette_enabled: editRoulette,
          "cf-turnstile-response": turnstileToken,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setMsg(json.error ?? "Failed to save");
        return;
      }
      showMsg("Saved");
      setEditing(false);
      setGame(await load());
    } catch {
      setMsg("Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    if (!confirm("Delete this game? This also removes all registrations and brackets.")) return;
    setPendingDelete(true);
  };

  const onDeleteVerify = async (token: string) => {
    if (!game || !token) return;
    await fetch(`/api/games/${game.id}`, {
      method: "DELETE",
      headers: { "x-turnstile-token": token },
    });
    trackEvent("game_delete");
    router.push("/games");
  };

  const handleAddContestant = async (p: { discord_id: string | null; discord_username: string }) => {
    if (!game) return;
    await fetch(`/api/games/${game.id}/contestants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discord_id: p.discord_id, username: p.discord_username }),
    });
    setGame(await load());
  };

  const [manualAdd, setManualAdd] = useState("");
  const handleManualAdd = async () => {
    if (!game || !manualAdd.trim()) return;
    if (manualAdd.trim().length > 40) {
      showMsg("Username too long");
      return;
    }
    const res = await fetch(`/api/games/${game.id}/contestants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: manualAdd.trim() }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.error) {
      showMsg(json?.error ?? "Failed to add player");
      return;
    }
    showMsg(json?.data?.warning ?? "Player added to bracket");
    setManualAdd("");
    setGame(await load());
  };

  const handleRemoveContestant = async (c: { discord_id: string | null; discord_username: string }) => {
    if (!game) return;
    await fetch(`/api/games/${game.id}/contestants`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discord_id: c.discord_id, username: c.discord_username }),
    });
    setGame(await load());
  };

  const handleGenerateBracket = async () => {
    if (!game) return;
    setBracketBusy(true);
    try {
      const res = await fetch(`/api/games/${game.id}/bracket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shuffle }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        showMsg(json.error ?? "Failed to generate bracket");
        return;
      }
      showMsg("Bracket generated");
      setGame(await load());
    } catch {
      showMsg("Failed to generate bracket");
    } finally {
      setBracketBusy(false);
    }
  };

  const handleDealShips = async () => {
    if (!game) return;
    setRouletteBusy(true);
    try {
      const res = await fetch(`/api/games/${game.id}/roulette`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        showMsg(json.error ?? "Failed to deal ships");
        return;
      }
      showMsg(`Dealt ${json.data?.players ?? 0} ship${(json.data?.players ?? 1) === 1 ? "" : "s"}`);
      setGame(await load());
    } catch {
      showMsg("Failed to deal ships");
    } finally {
      setRouletteBusy(false);
    }
  };

  if (loading) return <p className="text-center text-blue-200" role="status">Loading...</p>;
  if (notFound || !game) return <p className="text-center text-red-400">Game not found</p>;

  const notInBracket = game.participants.filter(
    (p) => !game.contestants.some(
      (c) => (p.discord_id && c.discord_id && c.discord_id === p.discord_id) ||
          (p.discord_username && c.discord_username && c.discord_username.toLowerCase() === p.discord_username.toLowerCase()),
    ),
  );

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/games" className="inline-flex items-center gap-1.5 text-sm text-blue-300 hover:text-cyan-300 transition-colors mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All Games
      </Link>

      <div className="mb-6 space-y-3">
        <div>
          <h1 className="text-2xl sm:text-4xl text-white uppercase">{game.title}</h1>
          <p className="text-blue-200 text-sm mt-1">
            by {game.owner_name} · {MODE_LABELS[game.game_mode] ?? game.game_mode} ·{" "}
            <span className={game.visibility === "private" ? "text-amber-300" : ""}>
              {game.visibility === "private" ? "Private" : "Public"}
            </span>{" "}
            · {STATUS_LABELS[game.status] ?? game.status}
          </p>
          <p className="text-cyan-300 text-sm mt-1">Game day: {formatDateTime(game.game_date)}</p>
          <p className="text-gray-400 text-xs">
            {game.register_open_at || game.register_close_at ? (
              <>
                Registration window:{" "}
                {game.register_open_at ? `opens ${formatDateTime(game.register_open_at)}` : "open"}
                {game.register_close_at ? ` · closes ${formatDateTime(game.register_close_at)}` : ""}
              </>
            ) : (
              "No registration window"
            )}
          </p>
          <p className="text-gray-400 text-xs">Created {formatDate(game.created_at)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isOwner && (
            <>
              <Button onClick={() => setEditing((v) => !v)}>{editing ? "Close Editor" : "Edit"}</Button>
              <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </>
          )}
          {game.visibility === "private" && isOwner && (
            <Button variant="amber" onClick={copyInvite}>
              {copied ? "Link copied!" : "Copy invite link"}
            </Button>
          )}
        </div>
      </div>

      {game.description && (
        <div className="text-white mb-6" dangerouslySetInnerHTML={{ __html: sanitizeHtml(game.description) }} />
      )}

      {game.collection && (
        <Card className="mb-6">
          <p className="text-sm text-blue-200">
            Linked collection:{" "}
            <Link href={`/collections/${game.collection.id}`} className="text-cyan-400 hover:underline">
              {game.collection.title}
            </Link>{" "}
            · {game.ships.length} ship{game.ships.length === 1 ? "" : "s"}
          </p>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="text-lg text-white uppercase mb-3">
          Players ({game.participants.length})
        </h2>
        {game.participants.length > 0 ? (
          <ul className="space-y-1 mb-4">
            {game.participants.map((p) => (
              <li key={`${p.discord_id ?? p.discord_username}`} className="text-sm text-blue-100 flex items-center justify-between gap-2">
                <span>{p.discord_username}{sameIdentity(p, user) && " (you)"}</span>
                {isOwner && game.game_mode === "tournament" && p.discord_username && (
                  <span className="text-xs text-gray-500">registered {formatDate(p.registered_at)}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-blue-200 text-sm mb-4">No players registered yet.</p>
        )}

        {game.status === "open" && (
          <div className="border-t border-[#1C598C]/40 pt-3">
            {game.status === "open" && regStatus === "not_open" && (
              <p className="text-blue-200 text-sm mb-2">Registrations open {formatDateTime(game.register_open_at!)}.</p>
            )}
            {game.status === "open" && regStatus === "closed" && (
              <p className="text-blue-200 text-sm mb-2">The registration window has closed.</p>
            )}
            {canRegister && (isLoggedIn ? (
              <div className="flex gap-2">
                {membership ? (
                  <Button variant="danger" onClick={() => leave()} disabled={busy}>
                    {busy ? "Leaving..." : "Leave game"}
                  </Button>
                ) : (
                  <Button onClick={() => register()} disabled={busy}>
                    {busy ? "Registering..." : "Register"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-blue-200 text-sm">
                  Not logged in? Register with your Discord username{" "}
                  <span className="text-gray-400">(name#disc or username)</span>.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Discord username"
                    className="w-48 p-2 bg-[#021526] border border-gray-400 rounded text-white text-sm"
                  />
                  {memberGuestMatch ? (
                    <Button variant="danger" onClick={() => leave({ username: guestName })} disabled={busy}>
                      {busy ? "Leaving..." : "Leave"}
                    </Button>
                  ) : (
                    <Button onClick={() => register({ username: guestName })} disabled={busy || !guestName.trim()}>
                      {busy ? "Registering..." : "Register"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {game.visibility === "private" && !isOwner && !membership && (
              <div className="mt-3">
                <label className="block text-blue-200 text-sm mb-1">Invite code (required for private games)</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Paste invite code"
                  className="w-48 p-2 bg-[#021526] border border-gray-400 rounded text-white text-sm"
                />
              </div>
            )}
            <p className="text-blue-200 text-xs mt-2">{origin}/games/join/{game.invite_code}</p>
          </div>
        )}
      </Card>

      {msg && <p className="text-cyan-400 text-sm mb-4" role="status">{msg}</p>}

      {isOwner && editing && (
        <Card className="mb-6 space-y-4">
          <h2 className="text-lg text-white uppercase">Edit Game</h2>
          <div>
            <label htmlFor="edit-game-title" className="block text-blue-200 mb-1">
              Title <span className="text-amber-300" aria-hidden="true">*</span>
            </label>
            <input
              id="edit-game-title"
              name="title"
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
              aria-required="true"
              className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white"
            />
          </div>
          <div>
            <label htmlFor="edit-game-description" className="block text-blue-200 mb-1">Description</label>
            <RichTextEditor value={editDescription} onChange={setEditDescription} rows={4} labelId="edit-game-description" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="edit-game-mode" className="block text-blue-200 mb-1">Game mode</label>
              <select id="edit-game-mode" name="game_mode" value={editMode} onChange={(e) => setEditMode(e.target.value as GameMode)} className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white">
                <option value="pvp">PvP</option>
                <option value="tournament">Tournament</option>
                <option value="campaign">Campaign</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-game-visibility" className="block text-blue-200 mb-1">Visibility</label>
              <select id="edit-game-visibility" name="visibility" value={editVisibility} onChange={(e) => setEditVisibility(e.target.value as GameVisibility)} className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white">
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-game-status" className="block text-blue-200 mb-1">Status</label>
              <select id="edit-game-status" name="status" value={editStatus} onChange={(e) => setEditStatus(e.target.value as GameStatus)} className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white">
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="finished">Finished</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="edit-game-collection" className="block text-blue-200 mb-1">Linked collection</label>
            <CollectionSelect id="edit-game-collection" name="collection_id" value={editCollectionId} onChange={setEditCollectionId} />
          </div>
          <div>
            <label htmlFor="edit-game-date" className="block text-blue-200 mb-1">
              Day of the game <span className="text-amber-300" aria-hidden="true">*</span>
            </label>
            <input
              id="edit-game-date"
              name="game_date"
              type="datetime-local"
              value={editGameDate}
              onChange={(e) => setEditGameDate(e.target.value)}
              required
              aria-required="true"
              className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-game-reg-open" className="block text-blue-200 mb-1">Registration opens</label>
              <input
                id="edit-game-reg-open"
                name="register_open_at"
                type="datetime-local"
                value={editRegOpen}
                onChange={(e) => setEditRegOpen(e.target.value)}
                aria-describedby="edit-game-reg-open-hint"
                className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white"
              />
              <p id="edit-game-reg-open-hint" className="text-gray-500 text-xs mt-1">Optional — clear to remove the window.</p>
            </div>
            <div>
              <label htmlFor="edit-game-reg-close" className="block text-blue-200 mb-1">Registration closes</label>
              <input
                id="edit-game-reg-close"
                name="register_close_at"
                type="datetime-local"
                value={editRegClose}
                onChange={(e) => setEditRegClose(e.target.value)}
                className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white"
              />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-blue-100 cursor-pointer">
            <input
              type="checkbox"
              name="roulette_enabled"
              checked={editRoulette}
              onChange={(e) => setEditRoulette(e.target.checked)}
              className="mt-0.5 accent-cyan-400"
            />
            <span>Ship roulette — deal each player a random ship from the linked collection.</span>
          </label>
          <TurnstileWidget ref={editTurnstileRef} />
          <Button onClick={saveEdit} disabled={busy || !editTitle.trim()}>
            {busy ? "Saving..." : "Save Changes"}
          </Button>
        </Card>
      )}

      {isOwner && pendingDelete && <TurnstileWidget onVerify={onDeleteVerify} />}

      {game.roulette_enabled && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg text-white uppercase">Ship Roulette</h2>
            {isOwner && game.ships.length > 0 && (
              <Button size="sm" onClick={handleDealShips} disabled={rouletteBusy}>
                {rouletteBusy ? "Dealing..." : game.draws.length > 0 ? "Re-deal ships" : "Deal ships"}
              </Button>
            )}
          </div>
          {game.ships.length === 0 ? (
            <p className="text-blue-200 text-sm">
              Ship roulette is enabled but no ships are linked — attach a collection to the game.
            </p>
          ) : game.draws.length > 0 ? (
            <ul className="space-y-1">
              {game.draws.map((d) => (
                <li key={d.participant_username} className="flex items-center justify-between gap-2 text-sm text-blue-100">
                  <span>{d.participant_username}</span>
                  <Link href={`/ship/${d.ship_id}`} className="text-cyan-400 hover:underline truncate max-w-[60%]">
                    {d.ship_name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-blue-200 text-sm">
              {isOwner ? "Ships not dealt yet — click “Deal ships”." : "Ships haven’t been dealt yet."}
            </p>
          )}
        </Card>
      )}

      {game.game_mode === "tournament" && (
        <Card>
          <h2 className="text-lg text-white uppercase mb-3">Tournament Bracket</h2>
          {isOwner ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-blue-200 text-sm mb-2">Registered — add to bracket:</p>
                  {notInBracket.length > 0 ? (
                    <ul className="space-y-1">
                      {notInBracket.map((p) => (
                        <li key={`${p.discord_id ?? p.discord_username}`} className="flex items-center justify-between gap-2 text-sm text-blue-100">
                          <span className="truncate">{p.discord_username}</span>
                          <Button size="sm" onClick={() => handleAddContestant(p)}>Add</Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-blue-200 text-sm">All registered players are already in the bracket.</p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <input
                      type="text"
                      value={manualAdd}
                      onChange={(e) => setManualAdd(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleManualAdd()}
                      placeholder="Add player manually (discord username)"
                      className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white text-sm"
                    />
                    <Button size="sm" onClick={handleManualAdd} disabled={!manualAdd.trim()}>Add</Button>
                  </div>
                  <p className="text-gray-500 text-xs mt-1">Anyone can be added directly — no registration required.</p>
                </div>
                <div>
                  <p className="text-blue-200 text-sm mb-2">Contestants ({game.contestants.length}):</p>
                  {game.contestants.length > 0 ? (
                    <ul className="space-y-1">
                      {game.contestants.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2 text-sm text-blue-100">
                          <span className="truncate">{c.discord_username}</span>
                          <Button size="sm" variant="danger" onClick={() => handleRemoveContestant(c)}>Remove</Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-blue-200 text-sm">Pick players from the registered list to build the bracket.</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <label className="flex items-center gap-2 text-sm text-blue-200">
                  <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
                  Shuffle seeds
                </label>
                <Button onClick={handleGenerateBracket} disabled={bracketBusy || game.contestants.length < 2}>
                  {bracketBusy ? "Generating..." : game.matches.length > 0 ? "Regenerate Bracket" : "Generate Bracket"}
                </Button>
              </div>
              <div className="border-t border-[#1C598C]/40 pt-3">
                <Bracket
                  key={game.matches.length}
                  gameId={game.id}
                  matches={game.matches}
                  contestants={game.contestants}
                  isOwner={isOwner}
                  onChanged={async () => setGame(await load())}
                />
              </div>
              {game.matches.length > 0 && (
                <p className="text-gray-500 text-xs mt-2">
                  Use the check (✓) to mark who advanced; byes advance automatically. The cross (✗) undoes a pick.
                  The final winner becomes the champion.
                </p>
              )}
            </>
          ) : (
            <Bracket
              key={game.matches.length}
              gameId={game.id}
              matches={game.matches}
              contestants={game.contestants}
              isOwner={false}
            />
          )}
        </Card>
      )}
    </div>
  );
}