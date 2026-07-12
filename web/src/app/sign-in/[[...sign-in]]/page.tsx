import { AuthShell } from '@/components/auth-shell';
import { readBrandFromEnv } from '@/lib/brand';

export default function SignInPage() {
  const brand = readBrandFromEnv();
  return <AuthShell mode="sign-in" brandName={brand.brandName} />;
}
