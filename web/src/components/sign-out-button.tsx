'use client';

import { useRouter } from 'next/navigation';
import { getAppCopy } from '@/lib/i18n';

export function SignOutButton({ className }: { className?: string }) {
  const copy = getAppCopy().common.actions;
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => {});
        router.replace('/');
        router.refresh();
      }}
    >
      {copy.signOut}
    </button>
  );
}
