'use client';

// Bottom-of-page actions for a single session — delete with a soft
// confirmation modal. On success, redirect back to /profile.

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { FocusDialog } from '@/components/focus-dialog';
import { getAppCopy, type AppLocale } from '@/lib/i18n';

export function SessionActions({
  sessionId,
  locale,
}: {
  sessionId: string;
  locale?: AppLocale;
}) {
  const appCopy = getAppCopy(locale);
  const copy = appCopy.sessionActions;
  const actions = appCopy.common.actions;
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keepButtonRef = useRef<HTMLButtonElement | null>(null);

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      router.replace('/profile');
      router.refresh();
    } catch {
      setBusy(false);
      setError(copy.deleteError);
    }
  };

  return (
    <div className="session-actions">
      <button
        type="button"
        className="session-actions__delete"
        onClick={() => setConfirming(true)}
      >
        {copy.deleteConversation}
      </button>

      {confirming && (
        <FocusDialog
          className="memory-strip__modal"
          labelledBy="session-delete-title"
          initialFocusRef={keepButtonRef}
          onEscape={() => {
            if (!busy) setConfirming(false);
          }}
          onClick={() => !busy && setConfirming(false)}
        >
          <div
            className="memory-strip__modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="session-delete-title" className="memory-strip__modal-title">
              {copy.deleteTitle}
            </h4>
            <p className="memory-strip__modal-sub">
              {copy.deleteSubcopy}
            </p>
            {error && <p className="session-actions__error">{error}</p>}
            <div className="memory-strip__modal-actions">
              <button
                ref={keepButtonRef}
                type="button"
                className="memory-strip__modal-keep"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                {actions.keepIt}
              </button>
              <button
                type="button"
                className="memory-strip__modal-forget"
                onClick={onDelete}
                disabled={busy}
              >
                {busy ? copy.deleting : actions.delete}
              </button>
            </div>
          </div>
        </FocusDialog>
      )}
    </div>
  );
}
