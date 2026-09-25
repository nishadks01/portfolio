import { NextResponse } from 'next/server';
import { getPortfolioData } from '@/lib/portfolio-data';

export async function GET() {
  try { return NextResponse.json(await getPortfolioData()); }
  catch { return NextResponse.json({ error: 'Unable to load portfolio data' }, { status: 500 }); }
}
