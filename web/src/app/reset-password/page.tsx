import { Suspense } from 'react';
import { ResetPasswordShell } from '@/components/reset-password-shell';
import { readBrandFromEnv } from '@/lib/brand';

export default function ResetPasswordPage() {
  const brand = readBrandFromEnv();
  return (
    <Suspense fallback={null}>
      <ResetPasswordShell brandName={brand.brandName} />
    </Suspense>
  );
}
