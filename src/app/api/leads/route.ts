import { NextResponse } from 'next/server';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-jKRb58vwoCWuSUrdHOxhEkMjAEp5hbMxNGtmSevR442bs9f_opzK0ONTBnmjlFHy3Q/exec';

export async function GET() {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Server-side fetch ignores CORS, so this works perfectly!
      redirect: 'follow',
      cache: 'no-store'
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Apps Script returned ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("API Proxy Error:", error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
