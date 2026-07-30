import { NextResponse } from 'next/server';
import { rankHits } from '@/lib/rank';
import { searchTickers } from '@/lib/yahoo';

export const revalidate = 3600;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ hits: [] });

  try {
    const hits = rankHits(await searchTickers(query)).slice(0, 8);
    return NextResponse.json({ hits });
  } catch {
    return NextResponse.json({ hits: [], error: 'Search is unavailable right now.' }, { status: 503 });
  }
}
