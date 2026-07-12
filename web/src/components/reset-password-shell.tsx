'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

type ResetPasswordShellProps = {
  brandName: string;
};

export function ResetPasswordShell({ brandName }: ResetPasswordShellProps) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setError('This reset link is missing or incomplete.');
      return;
    }
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (password !== confirm) {
      setPending(false);
      setError('Those passwords don’t match.');
      return;
    }
    if (password.length < 8) {
      setPending(false);
      setError('Use at least 8 characters.');
      return;
    }
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    }).catch(() => null);
    setPending(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      const code = body?.error;
      if (code === 'expired') setError('This reset link has expired. Request a new one.');
      else if (code === 'already_used') setError('This reset link has already been used.');
      else if (code === 'invalid_token') setError('This reset link is no longer valid.');
      else setError('We couldn’t reset your password. Try again.');
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.replace('/profile');
      router.refresh();
    }, 800);
  };

  return (
    <main className="screen auth-screen">
      <section className="auth-card" aria-label="Reset password">
        <div className="luna-mark auth-card__brand" aria-hidden>
          <span className="luna-mark__glyph" />
          <span className="luna-mark__word">{brandName}</span>
        </div>
        <h1 className="auth-card__h">Pick a new password</h1>
        <p className="auth-card__sub">
          Choose at least 8 characters. Resetting will sign you out of any other devices.
        </p>
        {!token ? (
          <p className="auth-form__error">
            This reset link is missing a token. Open the link from your email again, or
            <a href="/sign-in"> request a new one</a>.
          </p>
        ) : done ? (
          <p className="auth-card__sub">All set. Taking you in&hellip;</p>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <label className="auth-form__field">
              <span>New password</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label className="auth-form__field">
              <span>Confirm password</span>
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            {error && <p className="auth-form__error">{error}</p>}
            <button type="submit" className="btn-primary auth-form__submit" disabled={pending}>
              {pending ? 'One moment' : 'Set new password'}
            </button>
          </form>
        )}
        <p className="auth-card__fallback">
          <a href="/sign-in">Back to sign in</a>
        </p>
      </section>
    </main>
  );
}
