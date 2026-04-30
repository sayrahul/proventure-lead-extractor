import { NextResponse } from "next/server";
import { upsertLocalLeads } from "@/lib/local-leads";
import { getSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase-admin";

type TextSearchResult = {
  place_id?: string;
};

type TextSearchPayload = {
  results?: TextSearchResult[];
  next_page_token?: string;
};

type PlaceDetailsResult = {
  place_id?: string;
  name?: string;
  formatted_phone_number?: string;
  website?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
};

const GOOGLE_BASE_URL = "https://maps.googleapis.com/maps/api/place";
const DETAILS_FIELDS = "place_id,name,formatted_phone_number,website,formatted_address,rating,user_ratings_total,types";
const DETAIL_DELAY_MS = 225;
const PAGE_TOKEN_DELAY_MS = 2000;
const GOOGLE_TIMEOUT_MS = 15000;
const MAX_KEYWORDS = 8;
const DEPTH_CONFIG = {
  quick: { pages: 1, label: "Quick" },
  normal: { pages: 2, label: "Normal" },
  deep: { pages: 3, label: "Deep" },
} as const;

type SearchDepth = keyof typeof DEPTH_CONFIG;
type SaveFilter = "any" | "phone" | "website" | "both";

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SOCIAL_PATTERN = /https?:\/\/(?:www\.)?(?:linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com)\/[^\s"'<>]+/gi;
const NOISE_WORDS = new Set([
  "a",
  "an",
  "and",
  "best",
  "business",
  "company",
  "for",
  "in",
  "near",
  "nearby",
  "of",
  "service",
  "services",
  "shop",
  "the",
  "top",
]);
const CATEGORY_ALIASES: Record<string, string[]> = {
  architect: ["architect", "architecture"],
  architects: ["architect", "architecture"],
  builder: ["builder", "construction", "contractor", "real_estate_developer"],
  builders: ["builder", "construction", "contractor", "real_estate_developer"],
  clinic: ["clinic", "doctor", "health", "hospital", "medical"],
  clinics: ["clinic", "doctor", "health", "hospital", "medical"],
  diagnostic: ["diagnostic", "laboratory", "health", "medical"],
  hospital: ["hospital", "clinic", "doctor", "health", "medical", "emergency"],
  hospitals: ["hospital", "clinic", "doctor", "health", "medical", "emergency"],
  wellness: ["wellness", "health", "spa", "physiotherapist", "fitness", "gym", "yoga"],
  cafe: ["cafe", "coffee", "restaurant"],
  cafes: ["cafe", "coffee", "restaurant"],
};

export const runtime = "nodejs";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const payload = await response.json();

    if (!response.ok || (payload.status && !["OK", "ZERO_RESULTS"].includes(payload.status))) {
      throw new Error(payload.error_message || payload.status || "Google Places request failed.");
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Google Places request timed out. Try fewer keywords or a more specific location.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichWebsite(website: string | null) {
  if (!website) {
    return { email: null, social_links: [] as string[] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(website, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 Lead Extractor" },
    });
    const html = await response.text();
    const emails = [...new Set(html.match(EMAIL_PATTERN) ?? [])].filter(
      (email) => !/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(email),
    );
    const socialLinks = [...new Set(html.match(SOCIAL_PATTERN) ?? [])].slice(0, 5);

    return {
      email: emails[0] ?? null,
      social_links: socialLinks,
    };
  } catch {
    return { email: null, social_links: [] as string[] };
  } finally {
    clearTimeout(timeout);
  }
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !NOISE_WORDS.has(token));
}

function relevantTerms(keyword: string) {
  const terms = new Set<string>();

  for (const token of tokenize(keyword)) {
    terms.add(token);
    if (token.endsWith("s")) {
      terms.add(token.slice(0, -1));
    }
    for (const alias of CATEGORY_ALIASES[token] ?? []) {
      terms.add(alias);
    }
  }

  return [...terms];
}

function isRelevantPlace(place: PlaceDetailsResult, keywords: string[]) {
  const searchable = [
    place.name,
    place.formatted_address,
    ...(place.types ?? []).map((type) => type.replaceAll("_", " ")),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const allTerms = keywords.flatMap(relevantTerms);

  if (allTerms.length === 0) {
    return true;
  }

  return allTerms.some((term) => searchable.includes(term.replaceAll("_", " ")));
}

function qualityScore(place: PlaceDetailsResult, email: string | null, socialLinks: string[]) {
  let score = 25;

  if (place.formatted_phone_number) score += 25;
  if (place.website) score += 20;
  if (place.formatted_address) score += 10;
  if (email) score += 15;
  if (socialLinks.length > 0) score += 5;
  if ((place.rating ?? 0) >= 4.2) score += 8;
  if ((place.user_ratings_total ?? 0) >= 50) score += 7;

  return Math.min(score, 100);
}

function passesSaveFilter(place: PlaceDetailsResult, saveFilter: SaveFilter) {
  if (saveFilter === "phone") return Boolean(place.formatted_phone_number);
  if (saveFilter === "website") return Boolean(place.website);
  if (saveFilter === "both") return Boolean(place.formatted_phone_number && place.website);
  return true;
}

export async function POST(request: Request) {
  try {
    const { keywords, location, depth, saveFilter, enrich } = await request.json();
    const locationList = String(location ?? "")
      .split(/[\n,]+/)
      .map((item) => item.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .slice(0, 10);
    const searchDepth: SearchDepth =
      typeof depth === "string" && depth in DEPTH_CONFIG ? (depth as SearchDepth) : "normal";
    const cleanSaveFilter: SaveFilter =
      typeof saveFilter === "string" && ["any", "phone", "website", "both"].includes(saveFilter)
        ? (saveFilter as SaveFilter)
        : "any";
    const keywordList = String(keywords ?? "")
      .split(",")
      .map((keyword) => keyword.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .filter((keyword) => relevantTerms(keyword).length > 0)
      .slice(0, MAX_KEYWORDS);
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (keywordList.length === 0) {
      return NextResponse.json(
        { error: "Enter at least one specific keyword. Words like best/top/near are ignored." },
        { status: 400 },
      );
    }

    if (locationList.length === 0 || locationList.some((item) => item.length < 2)) {
      return NextResponse.json({ error: "Enter at least one valid location." }, { status: 400 });
    }

    if (!googleApiKey) {
      return NextResponse.json({ error: "Missing GOOGLE_PLACES_API_KEY." }, { status: 500 });
    }

    const placeIds = new Set<string>();

    for (const [keywordIndex, keyword] of keywordList.entries()) {
      for (const [locationIndex, cleanLocation] of locationList.entries()) {
        if (keywordIndex > 0 || locationIndex > 0) {
          await sleep(DETAIL_DELAY_MS);
        }

        let pageToken = "";

        for (let page = 0; page < DEPTH_CONFIG[searchDepth].pages; page += 1) {
          if (pageToken) {
            await sleep(PAGE_TOKEN_DELAY_MS);
          }

          const searchUrl = new URL(`${GOOGLE_BASE_URL}/textsearch/json`);
          searchUrl.searchParams.set("query", `${keyword} in ${cleanLocation}`);
          searchUrl.searchParams.set("key", googleApiKey);

          if (pageToken) {
            searchUrl.searchParams.set("pagetoken", pageToken);
          }

          const searchPayload = (await fetchJson(searchUrl.toString())) as TextSearchPayload;
          const results = searchPayload.results ?? [];

          for (const place of results) {
            if (place.place_id) {
              placeIds.add(place.place_id);
            }
          }

          if (!searchPayload.next_page_token) {
            break;
          }

          pageToken = searchPayload.next_page_token;
        }
      }
    }

    const uniquePlaceIds = [...placeIds];

    if (uniquePlaceIds.length === 0) {
      return NextResponse.json({ leads: [], saved: 0 });
    }

    const details: PlaceDetailsResult[] = [];

    for (const [index, placeId] of uniquePlaceIds.entries()) {
      if (index > 0) {
        await sleep(DETAIL_DELAY_MS);
      }

      const detailsUrl = new URL(`${GOOGLE_BASE_URL}/details/json`);
      detailsUrl.searchParams.set("place_id", placeId);
      detailsUrl.searchParams.set("fields", DETAILS_FIELDS);
      detailsUrl.searchParams.set("key", googleApiKey);

      const detailsPayload = await fetchJson(detailsUrl.toString());
      if (detailsPayload.result?.place_id) {
        details.push(detailsPayload.result);
      }
    }

    const relevantDetails = details.filter((item) => isRelevantPlace(item, keywordList));
    const rows = [];

    for (const place of relevantDetails.filter((item) => passesSaveFilter(item, cleanSaveFilter))) {
      const enriched = enrich ? await enrichWebsite(place.website ?? null) : { email: null, social_links: [] };

      rows.push({
        google_place_id: place.place_id ?? "",
        business_name: place.name || "Unnamed business",
        phone_number: place.formatted_phone_number || null,
        website: place.website || null,
        address: place.formatted_address || null,
        email: enriched.email,
        social_links: enriched.social_links,
        google_rating: place.rating ?? null,
        google_review_count: place.user_ratings_total ?? null,
        place_types: place.types ?? [],
        quality_score: qualityScore(place, enriched.email, enriched.social_links),
        notes: null,
        follow_up_date: null,
        search_query: `${keywordList.join(", ")} in ${locationList.join(", ")}`,
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({
        leads: [],
        saved: 0,
        searched: keywordList.length,
        locations: locationList.length,
        depth: DEPTH_CONFIG[searchDepth].label,
        discovered: uniquePlaceIds.length,
        relevant: relevantDetails.length,
      });
    }

    if (!hasSupabaseConfig()) {
      const data = await upsertLocalLeads(rows);
      return NextResponse.json({
        leads: data,
        saved: data.length,
        storage: "local",
        searched: keywordList.length,
        depth: DEPTH_CONFIG[searchDepth].label,
        discovered: uniquePlaceIds.length,
        relevant: relevantDetails.length,
        locations: locationList.length,
      });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leads")
      .upsert(rows, { onConflict: "google_place_id" })
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      leads: data ?? [],
      saved: data?.length ?? 0,
      storage: "supabase",
      searched: keywordList.length,
      depth: DEPTH_CONFIG[searchDepth].label,
      discovered: uniquePlaceIds.length,
      relevant: relevantDetails.length,
      locations: locationList.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
