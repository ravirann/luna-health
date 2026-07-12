'use client';

import { useState, type FormEvent } from 'react';

type ForgotPasswordShellProps = {
  brandName: string;
};

export function ForgotPasswordShell({ brandName }: ForgotPasswordShellProps) {
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email') }),
    }).catch(() => null);
    setPending(false);
    setSubmitted(true);
  };

  return (
    <main className="screen auth-screen">
      <section className="auth-card" aria-label="Forgot password">
        <div className="luna-mark auth-card__brand" aria-hidden>
          <span className="luna-mark__glyph" />
          <span className="luna-mark__word">{brandName}</span>
        </div>
        <h1 className="auth-card__h">Forgot your password?</h1>
        {submitted ? (
          <p className="auth-card__sub">
            If that email has an account, we’ve sent a reset link. Check your inbox in
            a minute or two — and your spam folder, just in case.
          </p>
        ) : (
          <>
            <p className="auth-card__sub">
              Enter your email and we’ll send you a link to set a new password.
            </p>
            <form className="auth-form" onSubmit={onSubmit}>
              <label className="auth-form__field">
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <button type="submit" className="btn-primary auth-form__submit" disabled={pending}>
                {pending ? 'One moment' : 'Send reset link'}
              </button>
            </form>
          </>
        )}
        <p className="auth-card__fallback">
          <a href="/sign-in">Back to sign in</a>
        </p>
      </section>
    </main>
  );
}
