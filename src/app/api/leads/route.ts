import { NextResponse } from "next/server";
import { listLocalLeads, updateLocalLead } from "@/lib/local-leads";
import { getSupabaseAdmin, hasSupabaseConfig, type LeadStatus } from "@/lib/supabase-admin";

const STATUSES: LeadStatus[] = ["New", "Verified", "Called", "Interested", "Not Interested", "Converted", "Rejected"];

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!hasSupabaseConfig()) {
      const leads = await listLocalLeads();
      return NextResponse.json({ leads, storage: "local" });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leads: data ?? [], storage: "supabase" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load leads.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, status, notes, follow_up_date } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "A valid lead id is required." }, { status: 400 });
    }

    const updates: Partial<{
      status: LeadStatus;
      notes: string | null;
      follow_up_date: string | null;
    }> = {};

    if (status !== undefined) {
      if (!STATUSES.includes(status)) {
        return NextResponse.json({ error: "A valid lead status is required." }, { status: 400 });
      }

      updates.status = status;
    }

    if (notes !== undefined) {
      updates.notes = typeof notes === "string" && notes.trim() ? notes.trim() : null;
    }

    if (follow_up_date !== undefined) {
      updates.follow_up_date = typeof follow_up_date === "string" && follow_up_date ? follow_up_date : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No lead updates were provided." }, { status: 400 });
    }

    if (!hasSupabaseConfig()) {
      const lead = await updateLocalLead(id, updates);
      return NextResponse.json({ lead, storage: "local" });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ lead: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update lead.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
