import { NextResponse } from "next/server";
import type { Lead } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type SheetLead = Pick<
  Lead,
  | "business_name"
  | "phone_number"
  | "email"
  | "website"
  | "address"
  | "google_rating"
  | "google_review_count"
  | "quality_score"
  | "social_links"
  | "search_query"
>;

export async function POST(request: Request) {
  try {
    const { leads } = (await request.json()) as { leads?: SheetLead[] };
    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    const token = process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;

    if (!webhookUrl) {
      return NextResponse.json({ error: "Missing GOOGLE_SHEETS_WEBHOOK_URL." }, { status: 500 });
    }

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "No leads were selected for Google Sheet sync." }, { status: 400 });
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        token: token || undefined,
        leads,
      }),
      redirect: "follow",
      cache: "no-store",
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok || payload.error) {
      return NextResponse.json(
        { error: payload.error || `Google Apps Script returned ${response.status}.` },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, added: payload.added ?? leads.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheet sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
