import { ForgotPasswordShell } from '@/components/forgot-password-shell';
import { readBrandFromEnv } from '@/lib/brand';

export default function ForgotPasswordPage() {
  const brand = readBrandFromEnv();
  return <ForgotPasswordShell brandName={brand.brandName} />;
}
