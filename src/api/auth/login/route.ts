
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Admin login is temporarily disabled. Direct navigation is enabled.' },
    { status: 503 } // Service Unavailable
  );
}
