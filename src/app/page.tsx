"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Database,
  FileSpreadsheet,
  Filter,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
} from "lucide-react";
import type { Lead } from "@/lib/supabase-admin";

const SEARCH_DEPTHS = [
  { value: "quick", label: "Quick", hint: "up to 20 per keyword" },
  { value: "normal", label: "Normal", hint: "up to 40 per keyword" },
  { value: "deep", label: "Deep", hint: "up to 60 per keyword" },
];
const SAVE_FILTERS = [
  { value: "any", label: "All leads" },
  { value: "phone", label: "Has phone" },
  { value: "website", label: "Has website" },
  { value: "both", label: "Phone + website" },
];
const KEYWORD_PRESETS = [
  "real estate firms, property dealers, builders",
  "architects, interior designers, construction companies",
  "schools, colleges, coaching centers",
  "clinics, hospitals, diagnostic centers",
];

type HistoryItem = {
  keywords: string;
  location: string;
  depth: string;
  saveFilter: string;
  createdAt: string;
};

function scoreTone(score: number | null | undefined) {
  if ((score ?? 0) >= 75) return "text-emerald-200 bg-emerald-400/10 border-emerald-300/20";
  if ((score ?? 0) >= 50) return "text-cyan-200 bg-cyan-400/10 border-cyan-300/20";
  return "text-amber-100 bg-amber-400/10 border-amber-300/20";
}

function ratingText(lead: Lead) {
  if (!lead.google_rating) return "No reviews";
  return `${lead.google_rating.toFixed(1)} (${lead.google_review_count ?? 0})`;
}

export default function Dashboard() {
  const [keywords, setKeywords] = useState("real estate firms, property dealers, builders");
  const [location, setLocation] = useState("Pune, Maharashtra");
  const [depth, setDepth] = useState("normal");
  const [saveFilter, setSaveFilter] = useState("any");
  const [enrich, setEnrich] = useState(false);
  const [tableFilter, setTableFilter] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [extractStatus, setExtractStatus] = useState("");
  const [storage, setStorage] = useState<"supabase" | "local" | "">("");

  async function loadLeads() {
    setError("");
    const response = await fetch("/api/leads", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to load leads.");
    }

    setLeads(payload.leads ?? []);
    setStorage(payload.storage ?? "");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeads()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    const saved = window.localStorage.getItem("proventure-search-history");
    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  function rememberSearch(item: HistoryItem) {
    const next = [item, ...history.filter((entry) => entry.keywords !== item.keywords || entry.location !== item.location)].slice(
      0,
      8,
    );
    setHistory(next);
    window.localStorage.setItem("proventure-search-history", JSON.stringify(next));
  }

  async function extractLeads(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExtracting(true);
    setError("");
    setNotice("");
    setExtractStatus("Searching Google Places...");

    const cleanKeywords = keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    const cleanLocations = location
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (cleanKeywords.length === 0) {
      setError("Enter at least one keyword, separated by commas.");
      setExtracting(false);
      return;
    }

    if (cleanLocations.length === 0) {
      setError("Enter at least one valid location.");
      setExtracting(false);
      return;
    }

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, location, depth, saveFilter, enrich }),
      });
      const payload = await response.json().catch(() => ({ error: "The server returned an unreadable response." }));

      if (!response.ok) {
        throw new Error(payload.error || "Extraction failed.");
      }

      setExtractStatus("Saving and refreshing leads...");
      await loadLeads();
      rememberSearch({ keywords, location, depth, saveFilter, createdAt: new Date().toISOString() });
      setNotice(
        `${payload.depth ?? "Normal"} search checked ${payload.discovered ?? 0} Google result${
          (payload.discovered ?? 0) === 1 ? "" : "s"
        }, kept ${payload.relevant ?? 0} relevant result${(payload.relevant ?? 0) === 1 ? "" : "s"} across ${
          payload.searched ?? cleanKeywords.length
        } keyword group${
          (payload.searched ?? cleanKeywords.length) === 1 ? "" : "s"
        } and ${payload.locations ?? cleanLocations.length} location${
          (payload.locations ?? cleanLocations.length) === 1 ? "" : "s"
        }. Saved ${payload.saved ?? 0} lead${(payload.saved ?? 0) === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setExtracting(false);
      setExtractStatus("");
    }
  }

  const filteredLeads = useMemo(() => {
    const needle = tableFilter.trim().toLowerCase();

    return leads.filter((lead) => {
      return (
        !needle ||
        [lead.business_name, lead.phone_number, lead.website, lead.address, lead.email, lead.search_query]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      );
    });
  }, [leads, tableFilter]);

  const stats = useMemo(() => {
    return {
      total: leads.length,
      phone: leads.filter((lead) => lead.phone_number).length,
      email: leads.filter((lead) => lead.email).length,
      reviewed: leads.filter((lead) => lead.google_rating).length,
    };
  }, [leads]);

  async function syncGoogleSheet() {
    setSyncingSheet(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: filteredLeads }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Google Sheet sync failed.");
      }

      setNotice(`Synced ${payload.added ?? filteredLeads.length} lead${filteredLeads.length === 1 ? "" : "s"} to Google Sheet.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Sheet sync failed.");
    } finally {
      setSyncingSheet(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#071013] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
              <Sparkles className="h-3.5 w-3.5" />
              Lead extraction workspace
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">Proventure Lead Extractor</h1>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center sm:min-w-[32rem]">
            {[
              ["Leads", stats.total],
              ["Phones", stats.phone],
              ["Emails", stats.email],
              ["Reviewed", stats.reviewed],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="text-2xl font-semibold">{value}</div>
                <div className="text-xs text-slate-400">{label}</div>
              </div>
            ))}
          </div>
        </header>

        <section className="grid gap-4 py-6 xl:grid-cols-[1fr_22rem]">
          <form onSubmit={extractLeads} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_0.8fr]">
              <label>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Keywords</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    value={keywords}
                    onChange={(event) => setKeywords(event.target.value)}
                    className="h-12 w-full rounded-lg border border-white/10 bg-slate-950/70 pl-12 pr-4 text-sm text-white outline-none transition focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-500/15"
                  />
                </div>
              </label>
              <label>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Locations</span>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-slate-500" />
                  <textarea
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    rows={1}
                    placeholder="Pune, Mumbai, Nashik"
                    className="min-h-12 w-full resize-y rounded-lg border border-white/10 bg-slate-950/70 py-3 pl-12 pr-4 text-sm text-white outline-none transition focus:border-emerald-400/70 focus:ring-4 focus:ring-emerald-500/15"
                  />
                </div>
              </label>
              <label>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Depth</span>
                <div className="relative">
                  <SlidersHorizontal className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <select
                    value={depth}
                    onChange={(event) => setDepth(event.target.value)}
                    className="h-12 w-full rounded-lg border border-white/10 bg-slate-950/70 pl-12 pr-9 text-sm text-white outline-none transition focus:border-emerald-400/70"
                  >
                    {SEARCH_DEPTHS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} - {option.hint}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
              <label>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Save filter</span>
                <select
                  value={saveFilter}
                  onChange={(event) => setSaveFilter(event.target.value)}
                  className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none transition focus:border-emerald-400/70"
                >
                  {SAVE_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-200">
                <input checked={enrich} onChange={(event) => setEnrich(event.target.checked)} type="checkbox" />
                Enrich email/social
              </label>
              <button
                type="submit"
                disabled={extracting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/60"
              >
                {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                Extract
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {KEYWORD_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setKeywords(preset)}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.08]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </form>

          <aside className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <CalendarDays className="h-4 w-4 text-emerald-300" />
              Search history
            </div>
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-sm text-slate-500">No searches yet.</div>
              ) : (
                history.map((item) => (
                  <button
                    key={`${item.createdAt}-${item.keywords}`}
                    type="button"
                    onClick={() => {
                      setKeywords(item.keywords);
                      setLocation(item.location);
                      setDepth(item.depth);
                      setSaveFilter(item.saveFilter);
                    }}
                    className="w-full rounded-md border border-white/10 bg-slate-950/50 p-3 text-left text-xs text-slate-300 transition hover:bg-white/[0.06]"
                  >
                    <div className="truncate font-medium text-slate-100">{item.keywords}</div>
                    <div className="mt-1 truncate text-slate-500">{item.location}</div>
                  </button>
                ))
              )}
            </div>
          </aside>
        </section>

        {(extracting || error || notice || storage === "local") && (
          <section className="mb-4 space-y-3">
            {extracting && (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                <Loader2 className="h-4 w-4 animate-spin" />
                {extractStatus || "Working..."}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                {notice}
              </div>
            )}
            {storage === "local" && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                <Database className="h-4 w-4 text-emerald-300" />
                Supabase is not configured, so leads are being saved locally in this project.
              </div>
            )}
          </section>
        )}

        <section className="mb-4 flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 sm:w-80">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={tableFilter}
                onChange={(event) => setTableFilter(event.target.value)}
                placeholder="Filter name, phone, email, area"
                className="h-10 w-full rounded-lg border border-white/10 bg-slate-950/70 pl-10 pr-3 text-sm text-white outline-none transition focus:border-emerald-400/70"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => loadLeads().catch((err) => setError(err.message))} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-200">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={syncGoogleSheet}
              disabled={filteredLeads.length === 0 || syncingSheet}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {syncingSheet ? "Syncing..." : "Sync Google Sheet"}
            </button>
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-slate-950/55 shadow-2xl shadow-black/20">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-4 font-semibold">Lead</th>
                  <th className="px-4 py-4 font-semibold">Contact</th>
                  <th className="px-4 py-4 font-semibold">Google Reviews</th>
                  <th className="px-4 py-4 font-semibold">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 4 }).map((__, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-4">
                          <div className="h-4 animate-pulse rounded bg-white/10" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-16 text-center text-slate-400">
                      {leads.length === 0 ? "No leads saved yet." : "No leads match this filter."}
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-4 py-4">
                        <div className="max-w-72 truncate font-medium text-white" title={lead.business_name}>
                          {lead.business_name}
                        </div>
                        <div className="mt-1 max-w-80 truncate text-xs text-slate-500" title={lead.address ?? ""}>
                          {lead.address || "N/A"}
                        </div>
                        {lead.website && (
                          <a href={lead.website} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200">
                            Website <ArrowUpRight className="h-3 w-3" />
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <div className="inline-flex items-center gap-2 text-slate-200">
                            <Phone className="h-3.5 w-3.5 text-emerald-300" />
                            {lead.phone_number || "N/A"}
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <Mail className="h-3.5 w-3.5 text-cyan-300" />
                            <span className="max-w-48 truncate">{lead.email || "N/A"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1 rounded-md border border-yellow-300/20 bg-yellow-400/10 px-2.5 py-1 text-xs font-semibold text-yellow-100">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          {ratingText(lead)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${scoreTone(lead.quality_score)}`}>
                          {lead.quality_score ?? 0}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
