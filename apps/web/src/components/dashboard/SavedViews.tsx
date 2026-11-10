"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createSavedView,
  deleteSavedView,
  savedViewHref,
  type DashboardParams,
  type SavedView,
} from "@/lib/dashboard";

type Props = {
  views: SavedView[];
  /** The dashboard settings to save. `year` is null when the URL has no year. */
  current: DashboardParams;
};

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** Save the current dashboard settings under a name, and list, open or delete saved views. */
export function SavedViews({ views, current }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (await run(() => createSavedView({ name, ...current }))) setName("");
  }

  async function onDelete(view: SavedView) {
    if (!window.confirm(`Delete the saved view "${view.name}"?`)) return;
    await run(() => deleteSavedView(view.id));
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <form onSubmit={onSave} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Save this view as
          <input
            className={inputClass}
            value={name}
            maxLength={60}
            placeholder="e.g. G7 GDP per capita"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className={buttonClass} disabled={busy}>
          Save
        </button>
      </form>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Saved views</span>
        {views.length === 0 && <span className="text-xs text-zinc-400">None yet</span>}
        {views.map((view) => (
          <span
            key={view.id}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs dark:border-zinc-700"
          >
            <Link href={savedViewHref(view)} className="hover:underline">
              {view.name}
            </Link>
            <button
              type="button"
              aria-label={`Delete ${view.name}`}
              className="text-zinc-400 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
              disabled={busy}
              onClick={() => onDelete(view)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
