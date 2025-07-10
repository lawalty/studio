
// This file is no longer needed for Passkey authentication and is now empty.
// The password-based login logic has been completely removed.
// Keeping the empty file prevents a 404 error if any old code references it,
// but it performs no actions. It can be safely deleted later.
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'This login method is deprecated. Please use Passkey authentication.' },
    { status: 410 }
  );
}
