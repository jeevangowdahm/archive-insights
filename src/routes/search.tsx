import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "framer-motion";
import { Search as SearchIcon, Loader2, FileText, SlidersHorizontal } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { semanticSearch } from "@/lib/documents.functions";
import { requireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/search")({
  component: SearchPage,
  beforeLoad: ({ location }) => requireAuth(location.href),
  head: () => ({
    meta: [
      { title: "Search — Neurive" },
      { name: "description", content: "Semantic search across your archival documents with date filters." },
    ],
  }),
});

const ENTITY_COLORS: Record<string, string> = {
  PERSON: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  ORG: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200",
  LOCATION: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
  DATE: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  EVENT: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200",
  OTHER: "bg-muted text-muted-foreground",
};

function highlightTerms(text: string, query: string) {
  if (!query.trim()) return text;
  const terms = Array.from(new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length > 2)));
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((p, i) =>
    re.test(p) ? <mark key={i} className="rounded bg-primary/20 px-0.5 text-foreground">{p}</mark> : <span key={i}>{p}</span>,
  );
}

function SearchPage() {
  const [q, setQ] = useState("");
  const [topK, setTopK] = useState(10);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const search = useServerFn(semanticSearch);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true); setErr(null);
    try {
      const { results } = await search({
        data: {
          query: q,
          matchCount: topK,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      });
      setResults(results);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="font-serif text-4xl font-semibold">Semantic search</h1>
        <p className="mt-2 text-muted-foreground">Ask in natural language. Neurive ranks passages by meaning.</p>

        <form onSubmit={go} className="mt-8 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. references to railway construction in the 1880s"
                className="w-full rounded-md border border-input bg-card py-3 pl-10 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 text-sm hover:bg-accent"
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
              Search
            </button>
          </div>

          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3"
            >
              <label className="text-xs">
                <span className="text-muted-foreground">Date from</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Date to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Top K: {topK}</span>
                <input
                  type="range"
                  min={1}
                  max={25}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="mt-2 w-full accent-[var(--primary)]"
                />
              </label>
            </motion.div>
          )}
        </form>

        {err && <p className="mt-4 text-sm text-destructive">{err}</p>}

        <div className="mt-8 space-y-4">
          {results?.length === 0 && <p className="text-muted-foreground">No matches. Try different wording.</p>}
          {results?.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.03 }}
              className="rounded-lg border border-border bg-card p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <Link
                  to="/document/$id"
                  params={{ id: r.document_id }}
                  className="flex items-center gap-2 font-medium text-primary hover:underline"
                >
                  <FileText className="h-4 w-4" />
                  {r.document?.filename ?? "Document"}
                </Link>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {r.document?.doc_date && <span>{r.document.doc_date}</span>}
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-primary">
                    {(r.similarity * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                {highlightTerms(r.content, q)}
              </p>
              {Array.isArray(r.document?.entities) && r.document.entities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.document.entities.slice(0, 8).map((e: any, j: number) => (
                    <span
                      key={j}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${ENTITY_COLORS[e.type] ?? ENTITY_COLORS.OTHER}`}
                    >
                      {e.name}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
