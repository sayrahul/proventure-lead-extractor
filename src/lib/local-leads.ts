import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { Lead, LeadStatus } from "@/lib/supabase-admin";

type StoredLead = Lead;

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "leads.json");

async function readLeads() {
  try {
    const content = await readFile(DATA_FILE, "utf8");
    return JSON.parse(content) as StoredLead[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^\w]+/g, "");
}

function findDuplicate(leads: StoredLead[], row: Partial<Lead>) {
  const phone = normalize(row.phone_number);
  const website = normalize(row.website);
  const nameAddress = normalize(`${row.business_name ?? ""}${row.address ?? ""}`);

  return leads.find((lead) => {
    if (row.google_place_id && lead.google_place_id === row.google_place_id) {
      return true;
    }

    if (phone && normalize(lead.phone_number) === phone) {
      return true;
    }

    if (website && normalize(lead.website) === website) {
      return true;
    }

    return Boolean(nameAddress && normalize(`${lead.business_name}${lead.address ?? ""}`) === nameAddress);
  });
}

async function writeLeads(leads: StoredLead[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(leads, null, 2), "utf8");
}

export async function listLocalLeads() {
  const leads = await readLeads();
  return leads.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function upsertLocalLeads(
  rows: Array<Omit<Lead, "id" | "created_at" | "updated_at" | "status"> & { status?: LeadStatus }>,
) {
  const existing = await readLeads();
  const leads = [...existing];
  const now = new Date().toISOString();
  const touchedIds = new Set<string>();

  for (const row of rows) {
    const current = findDuplicate(leads, row);
    const next: StoredLead = {
      id: current?.id ?? randomUUID(),
      created_at: current?.created_at ?? now,
      updated_at: now,
      status: current?.status ?? row.status ?? "New",
      google_place_id: row.google_place_id,
      business_name: row.business_name,
      phone_number: row.phone_number,
      website: row.website,
      address: row.address,
      email: row.email ?? current?.email ?? null,
      social_links: row.social_links ?? current?.social_links ?? [],
      google_rating: row.google_rating ?? current?.google_rating ?? null,
      google_review_count: row.google_review_count ?? current?.google_review_count ?? null,
      place_types: row.place_types ?? current?.place_types ?? [],
      quality_score: row.quality_score ?? current?.quality_score ?? 0,
      notes: current?.notes ?? row.notes ?? null,
      follow_up_date: current?.follow_up_date ?? row.follow_up_date ?? null,
      search_query: row.search_query,
    };

    if (current) {
      leads[leads.findIndex((lead) => lead.id === current.id)] = next;
    } else {
      leads.push(next);
    }

    touchedIds.add(next.id);
  }

  const sorted = leads.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  await writeLeads(sorted);
  return sorted.filter((lead) => touchedIds.has(lead.id));
}

export async function updateLocalLead(id: string, updates: Partial<Pick<Lead, "status" | "notes" | "follow_up_date">>) {
  const leads = await readLeads();
  const index = leads.findIndex((lead) => lead.id === id);

  if (index === -1) {
    throw new Error("Lead not found.");
  }

  leads[index] = {
    ...leads[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };

  await writeLeads(leads);
  return leads[index];
}
