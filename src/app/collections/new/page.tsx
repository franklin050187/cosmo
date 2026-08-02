"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import RichTextEditor from "@/components/ui/RichTextEditor";
import TurnstileWidget from "@/components/TurnstileWidget";
import type { TurnstileWidgetHandle } from "@/components/TurnstileWidget";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { trackEvent } from "@/lib/analytics-client";

function NewCollectionContent() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Title is required");
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
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), "cf-turnstile-response": turnstileToken }),
      });
      const data = await res.json();
      if (data.id) {
        trackEvent("collection_create");
        router.push(`/collections/${data.id}`);
      } else {
        setError(data.error ?? "Failed to create");
        turnstileRef.current?.reset();
      }
    } catch {
      setError("Failed to create collection");
      turnstileRef.current?.reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-4xl text-white text-center uppercase mb-8">
        New Collection
      </h1>

      <Card className="space-y-4">
        <div>
          <label className="block text-blue-200 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My favorite ships"
            className="w-full p-2 bg-[#021526] border border-gray-400 rounded text-white"
          />
        </div>

        <div>
          <label className="block text-blue-200 mb-1">Description</label>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="Optional description..."
            rows={4}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <TurnstileWidget ref={turnstileRef} />

        <Button
          onClick={handleCreate}
          disabled={saving || !title.trim()}
        >
          {saving ? "Creating..." : "Create Collection"}
        </Button>
      </Card>
    </div>
  );
}

export default function NewCollectionPage() {
  return (
    <RequireAuth>
      <NewCollectionContent />
    </RequireAuth>
  );
}
