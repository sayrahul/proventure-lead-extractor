import { createClient } from "@supabase/supabase-js";

export type LeadStatus = "New" | "Verified" | "Called" | "Interested" | "Not Interested" | "Converted" | "Rejected";

export type Lead = {
  id: string;
  created_at: string;
  updated_at: string;
  google_place_id: string;
  business_name: string;
  phone_number: string | null;
  website: string | null;
  address: string | null;
  email: string | null;
  social_links: string[] | null;
  google_rating: number | null;
  google_review_count: number | null;
  place_types: string[] | null;
  quality_score: number | null;
  notes: string | null;
  follow_up_date: string | null;
  status: LeadStatus;
  search_query: string | null;
};

export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
