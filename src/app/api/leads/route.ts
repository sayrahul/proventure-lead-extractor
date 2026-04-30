import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ error: "Missing GOOGLE_SHEETS_WEBHOOK_URL in .env" }, { status: 500 });
    }

    // Follow redirects because Google Apps Script Web Apps almost always redirect
    const response = await fetch(webhookUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    const data = await response.json();
    
    // Map the sheet columns back to Lead objects
    const leads = (Array.isArray(data) ? data : []).map((row: any, index: number) => ({
      id: `sheet-row-${index}`,
      business_name: row["Business Name"] || row["business_name"] || "",
      phone_number: row["Phone"] || row["phone_number"] || "",
      website: row["Website"] || row["website"] || "",
      address: row["Address"] || row["address"] || "",
      google_rating: parseFloat(row["Rating"] || row["google_rating"]) || null,
      google_review_count: parseInt(row["Reviews"] || row["google_review_count"]) || null,
      search_query: row["Search Query"] || row["search_query"] || "",
      created_at: new Date().toISOString(),
    }));

    return NextResponse.json({ leads, storage: "google-sheets" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load leads from Google Sheets.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
