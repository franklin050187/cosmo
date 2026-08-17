"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import RichTextEditor from "@/components/ui/RichTextEditor";
import TurnstileWidget from "@/components/TurnstileWidget";
import type { TurnstileWidgetHandle } from "@/components/TurnstileWidget";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import CollectionSelect from "@/components/games/CollectionSelect";
import { trackEvent } from "@/lib/analytics-client";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/format-date";

const MODES = [
  { value: "pvp", label: "PvP" },
  { value: "tournament", label: "Tournament" },
  { value: "campaign", label: "Campaign" },
];

function NewGameContent() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gameMode, setGameMode] = useState("pvp");
  const [visibility, setVisibility] = useState("public");
  const [collectionId, setCollectionId] = useState("");
  const [gameDate, setGameDate] = useState(() => toDatetimeLocal(new Date(Date.now() + 86400000)));
  const [regOpen, setRegOpen] = useState("");
  const [regClose, setRegClose] = useState("");
  const [roulette, setRoulette] = useState(false);
  const [bracketType, setBracketType] = useState<"single_elim" | "double_elim">("single_elim");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const inputClass = "w-full p-2 bg-[#021526] border border-gray-400 rounded text-white";

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    const gameDateIso = fromDatetimeLocal(gameDate);
    if (!gameDateIso) {
      setError("Day of the game is required");
      return;
    }
    const regOpenIso = fromDatetimeLocal(regOpen);
    const regCloseIso = fromDatetimeLocal(regClose);
    if (regOpenIso && regCloseIso && new Date(regOpenIso) > new Date(regCloseIso)) {
      setError("Registration window ends before it starts");
      return;
    }
    const turnstileToken = turnstileRef.current?.getToken();
    if (!turnstileToken) {
      setError("Please complete the Turnstile captcha.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          game_mode: gameMode,
          visibility,
          collection_id: collectionId ? parseInt(collectionId, 10) : null,
          game_date: gameDateIso,
          register_open_at: regOpenIso,
          register_close_at: regCloseIso,
          roulette_enabled: roulette,
          bracket_type: bracketType,
          "cf-turnstile-response": turnstileToken,
        }),
      });
      const json = await res.json();
      if (json.data?.id) {
        trackEvent("game_create");
        router.push(`/games/${json.data.id}`);
      } else {
        setError(json.error ?? "Failed to create game");
        turnstileRef.current?.reset();
      }
    } catch {
      setError("Failed to create game");
      turnstileRef.current?.reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-4xl text-white text-center uppercase mb-8">New Game</h1>

      <Card className="space-y-4">
        <div>
          <label htmlFor="game-title" className="block text-blue-200 mb-1">
            Title <span className="text-amber-300" aria-hidden="true">*</span>
          </label>
          <input
            id="game-title"
            name="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Friday Night Fleet Brawl"
            required
            aria-required="true"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="game-description" className="block text-blue-200 mb-1">Description</label>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="Rules, schedule, prizes..."
            rows={4}
            labelId="game-description"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="game-mode" className="block text-blue-200 mb-1">Game mode</label>
            <select
              id="game-mode"
              name="game_mode"
              value={gameMode}
              onChange={(e) => setGameMode(e.target.value)}
              className={inputClass}
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="game-visibility" className="block text-blue-200 mb-1">Visibility</label>
            <select
              id="game-visibility"
              name="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className={inputClass}
            >
              <option value="public">Public (listed)</option>
              <option value="private">Private (invite link)</option>
            </select>
          </div>
        </div>

        {gameMode === "tournament" && (
          <div>
            <label htmlFor="game-bracket" className="block text-blue-200 mb-1">Bracket format</label>
            <select
              id="game-bracket"
              name="bracket_type"
              value={bracketType}
              onChange={(e) => setBracketType(e.target.value as "single_elim" | "double_elim")}
              className={inputClass}
            >
              <option value="single_elim">Single elimination</option>
              <option value="double_elim">Double elimination</option>
            </select>
          </div>
        )}

        <div>
          <label htmlFor="game-date" className="block text-blue-200 mb-1">
            Day of the game <span className="text-amber-300" aria-hidden="true">*</span>
          </label>
          <input
            id="game-date"
            name="game_date"
            type="datetime-local"
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value)}
            required
            aria-required="true"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="game-reg-open" className="block text-blue-200 mb-1">Registration opens</label>
            <input
              id="game-reg-open"
              name="register_open_at"
              type="datetime-local"
              value={regOpen}
              onChange={(e) => setRegOpen(e.target.value)}
              aria-describedby="game-reg-open-hint"
              className={inputClass}
            />
            <p id="game-reg-open-hint" className="text-gray-500 text-xs mt-1">
              Optional — leave blank for no window.
            </p>
          </div>
          <div>
            <label htmlFor="game-reg-close" className="block text-blue-200 mb-1">Registration closes</label>
            <input
              id="game-reg-close"
              name="register_close_at"
              type="datetime-local"
              value={regClose}
              onChange={(e) => setRegClose(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="game-collection" className="block text-blue-200 mb-1">Linked collection (ships)</label>
          <CollectionSelect id="game-collection" name="collection_id" value={collectionId} onChange={setCollectionId} />
          <p id="game-collection-hint" className="text-gray-500 text-xs mt-1">
            Ships are snapshotted when the game is created.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-blue-100 cursor-pointer">
          <input
            type="checkbox"
            name="roulette_enabled"
            checked={roulette}
            onChange={(e) => setRoulette(e.target.checked)}
            className="mt-0.5 accent-cyan-400"
          />
          <span>
            Ship roulette — each registered player is dealt a random ship from the
            linked collection. The owner deals ships from the game page.
          </span>
        </label>

        <p className="text-gray-500 text-xs">
          A private invite link is generated automatically after creation.
        </p>

        {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

        <TurnstileWidget ref={turnstileRef} />

        <Button onClick={handleCreate} disabled={saving || !title.trim()}>
          {saving ? "Creating..." : "Create Game"}
        </Button>
      </Card>
    </div>
  );
}

export default function NewGamePage() {
  return (
    <RequireAuth>
      <NewGameContent />
    </RequireAuth>
  );
}