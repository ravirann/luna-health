import { AuthShell } from '@/components/auth-shell';
import { readBrandFromEnv } from '@/lib/brand';

export default function SignUpPage() {
  const brand = readBrandFromEnv();
  return <AuthShell mode="sign-up" brandName={brand.brandName} />;
}
