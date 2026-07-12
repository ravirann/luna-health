'use client';

// MemoryStrip — soft text rows showing what Luna gently remembers.
// Server passes bullets derived from reflection facts; this component
// lets the user lightly forget or edit them. Both are client-only
// overrides for now (localStorage). Server-side persistence will replace
// this once a `user_memory_overrides` table lands.

import { useEffect, useMemo, useRef, useState } from 'react';
import { FocusDialog } from '@/components/focus-dialog';
import { getAppCopy, interpolate, type AppLocale } from '@/lib/i18n';

const FORGOTTEN_KEY = 'luna:forgotten-memories';
const EDITED_KEY = 'luna:edited-memories';

function readForgotten(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FORGOTTEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeForgotten(list: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FORGOTTEN_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function readEdits(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(EDITED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim().length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeEdits(map: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EDITED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

type Editing = { original: string; draft: string };

export function MemoryStrip({
  bullets,
  locale,
}: {
  bullets: string[];
  locale?: AppLocale;
}) {
  const appCopy = getAppCopy(locale);
  const copy = appCopy.memoryStrip;
  const actions = appCopy.common.actions;
  const [forgotten, setForgotten] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pendingForget, setPendingForget] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const keepButtonRef = useRef<HTMLButtonElement | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setForgotten(readForgotten());
      setEdits(readEdits());
      setHydrated(true);
    });
  }, []);

  const visible = useMemo(() => {
    if (!hydrated) return [] as { key: string; text: string }[];
    const set = new Set(forgotten);
    return bullets
      .filter((b) => !set.has(b))
      .map((b) => ({ key: b, text: edits[b] ?? b }));
  }, [bullets, forgotten, edits, hydrated]);

  if (!hydrated || visible.length === 0) return null;

  const confirmForget = (bullet: string) => setPendingForget(bullet);
  const doForget = () => {
    if (!pendingForget) return;
    const next = [...forgotten, pendingForget];
    setForgotten(next);
    writeForgotten(next);
    setPendingForget(null);
  };
  const cancelForget = () => setPendingForget(null);

  const startEdit = (key: string, currentText: string) =>
    setEditing({ original: key, draft: currentText });
  const cancelEdit = () => setEditing(null);
  const saveEdit = () => {
    if (!editing) return;
    const draft = editing.draft.trim();
    if (draft.length === 0) return cancelEdit();
    if (draft === editing.original) return cancelEdit();
    const next = { ...edits, [editing.original]: draft };
    setEdits(next);
    writeEdits(next);
    setEditing(null);
  };

  return (
    <section className="memory-strip" aria-labelledby="memory-strip-title">
      <header className="memory-strip__head">
        <h3 id="memory-strip-title" className="memory-strip__title">
          {copy.title}
        </h3>
        <p className="memory-strip__sub">{copy.subcopy}</p>
      </header>

      <ul className="memory-strip__list">
        {visible.map(({ key, text }) => (
          <li key={key} className="memory-strip__row">
            <span className="memory-strip__dot" aria-hidden />
            <span className="memory-strip__text">{text}</span>
            <span className="memory-strip__actions">
              <button
                type="button"
                className="memory-strip__act"
                onClick={() => startEdit(key, text)}
                aria-label={interpolate(copy.editLabel, { text })}
              >
                {actions.edit}
              </button>
              <button
                type="button"
                className="memory-strip__act memory-strip__act--quiet"
                onClick={() => confirmForget(key)}
                aria-label={interpolate(copy.forgetLabel, { text })}
              >
                {actions.forget}
              </button>
            </span>
          </li>
        ))}
      </ul>

      {pendingForget && (
        <FocusDialog
          className="memory-strip__modal"
          labelledBy="memory-forget-title"
          initialFocusRef={keepButtonRef}
          onEscape={cancelForget}
          onClick={cancelForget}
        >
          <div
            className="memory-strip__modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="memory-forget-title" className="memory-strip__modal-title">
              {copy.forgetTitle}
            </h4>
            <p className="memory-strip__modal-sub">
              {copy.forgetSubcopy}
            </p>
            <p className="memory-strip__modal-quote">“{pendingForget}”</p>
            <div className="memory-strip__modal-actions">
              <button
                ref={keepButtonRef}
                type="button"
                className="memory-strip__modal-keep"
                onClick={cancelForget}
              >
                {actions.keepIt}
              </button>
              <button
                type="button"
                className="memory-strip__modal-forget"
                onClick={doForget}
              >
                {actions.forget}
              </button>
            </div>
          </div>
        </FocusDialog>
      )}

      {editing && (
        <FocusDialog
          className="memory-strip__modal"
          labelledBy="memory-edit-title"
          initialFocusRef={editInputRef}
          onEscape={cancelEdit}
          onClick={cancelEdit}
        >
          <div
            className="memory-strip__modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="memory-edit-title" className="memory-strip__modal-title">
              {copy.editTitle}
            </h4>
            <p className="memory-strip__modal-sub">
              {copy.editSubcopy}
            </p>
            <textarea
              ref={editInputRef}
              className="memory-strip__modal-input"
              value={editing.draft}
              onChange={(e) =>
                setEditing({ original: editing.original, draft: e.target.value })
              }
              rows={3}
              aria-label={copy.editInputLabel}
            />
            <div className="memory-strip__modal-actions">
              <button
                type="button"
                className="memory-strip__modal-keep"
                onClick={cancelEdit}
              >
                {actions.cancel}
              </button>
              <button
                type="button"
                className="memory-strip__modal-forget"
                onClick={saveEdit}
              >
                {actions.save}
              </button>
            </div>
          </div>
        </FocusDialog>
      )}
    </section>
  );
}
