import { NextResponse } from 'next/server';
import { ensureUser } from '@/lib/auth';

export async function GET() {
  const user = await ensureUser();
  return NextResponse.json({ user });
}
