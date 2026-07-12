'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { getAppCopy, interpolate } from '@/lib/i18n';

type AuthShellProps = {
  mode: 'sign-in' | 'sign-up';
  brandName: string;
};

export function AuthShell({ mode, brandName }: AuthShellProps) {
  const router = useRouter();
  const params = useSearchParams();
  const copy = getAppCopy().auth;
  const isSignIn = mode === 'sign-in';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const res = await fetch(isSignIn ? '/api/auth/sign-in' : '/api/auth/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
        displayName: form.get('displayName'),
      }),
    }).catch(() => null);
    setPending(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error === 'email_taken' ? 'That email already has a password.' : 'Check your email and password.');
      return;
    }
    router.replace(params.get('next') || '/');
    router.refresh();
  };

  return (
    <main className="screen auth-screen">
      <section
        className="auth-card"
        aria-label={isSignIn ? copy.signInLabel : copy.signUpLabel}
      >
        <div className="luna-mark auth-card__brand" aria-hidden>
          <span className="luna-mark__glyph" />
          <span className="luna-mark__word">{brandName}</span>
        </div>
        <h1 className="auth-card__h">
          {isSignIn ? copy.signInHeading : copy.signUpHeading}
        </h1>
        <p className="auth-card__sub">
          {isSignIn ? copy.signInSubcopy : copy.signUpSubcopy}
        </p>
        <form className="auth-form" onSubmit={onSubmit}>
          {!isSignIn && (
            <label className="auth-form__field">
              <span>Name</span>
              <input name="displayName" type="text" autoComplete="name" maxLength={80} />
            </label>
          )}
          <label className="auth-form__field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="auth-form__field">
            <span className="auth-form__field-label-row">
              <span>Password</span>
              {isSignIn && (
                <a className="auth-form__inline-link" href="/forgot-password">
                  Forgot password?
                </a>
              )}
            </span>
            <input
              name="password"
              type="password"
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              minLength={isSignIn ? 1 : 8}
              required
            />
          </label>
          {error && <p className="auth-form__error">{error}</p>}
          <button
            type="submit"
            className="btn-primary auth-form__submit auth-form__submit--strong"
            disabled={pending}
          >
            {pending
              ? 'One moment'
              : isSignIn
                ? copy.signInLabel
                : copy.signUpLabel}
          </button>
        </form>
        <p className="auth-card__switch">
          {isSignIn ? "New here? " : 'Already have an account? '}
          <a href={isSignIn ? '/sign-up' : '/sign-in'}>
            {isSignIn ? 'Create an account' : 'Sign in'}
          </a>
        </p>
        <p className="auth-card__fallback">
          {interpolate(copy.fallback, { mode: isSignIn ? 'sign-in' : 'sign-up' })}
        </p>
      </section>
    </main>
  );
}
