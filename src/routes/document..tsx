import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, FileText, Tag, Loader2, ExternalLink, Search as SearchIcon, MessageSquare } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { getDocument, semanticSearch } from "@/lib/documents.functions";

export const Route = createFileRoute("/document/")({
  component: DocPage,
  head: () => ({ meta: [{ title: "Document — Neurive" }] }),
});

const ENTITY_COLORS: Record<string, string> = {
  PERSON: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  ORG: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200",
  LOCATION: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
  DATE: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  EVENT: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200",
  OTHER: "bg-muted text-muted-foreground",
};

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  extracting: "Extracting text",
  ocr: "Running OCR",
  chunking: "Chunking",
  embedding: "Embedding",
  summarizing: "Summarizing & NER",
  ready: "Ready",
  error: "Failed",
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, entities, snippetTerms }: { text: string; entities: any[]; snippetTerms: string[] }) {
  // Build a single regex for entity names + snippet terms
  const entityNames = (entities ?? []).map((e: any) => e.name).filter(Boolean);
  const entityMap = new Map<string, string>(
    (entities ?? []).map((e: any) => [String(e.name).toLowerCase(), e.type as string]),
  );
  const allTerms = [...entityNames, ...snippetTerms].filter((t) => t && t.length > 1);
  if (!allTerms.length) return <>{text}</>;
  const sorted = Array.from(new Set(allTerms)).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${sorted.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        const lower = p.toLowerCase();
        const entType = entityMap.get(lower);
        if (entType) {
          return (
            <span key={i} className={`rounded px-0.5 ${ENTITY_COLORS[entType] ?? ENTITY_COLORS.OTHER}`}>
              {p}
            </span>
          );
        }
        if (snippetTerms.some((t) => t.toLowerCase() === lower)) {
          return <mark key={i} className="rounded bg-primary/20 px-0.5 text-foreground">{p}</mark>;
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function DocPage() {
  const { id } = Route.useParams();
  const fetchDoc = useServerFn(getDocument);
  const findInDoc = useServerFn(semanticSearch);
  const [query, setQuery] = useState("");
  const [snippets, setSnippets] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["doc", id],
    queryFn: () => fetchDoc({ data: { id } }),
    refetchInterval: (q) => (q.state.data?.document.status === "processing" ? 1500 : false),
  });

  const snippetTerms = useMemo(
    () => Array.from(new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length > 2))),
    [query],
  );

  async function runFind(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await findInDoc({ data: { query, documentId: id, matchCount: 5 } });
      setSnippets(r.results);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {error && <p className="text-destructive">{(error as Error).message}</p>}
        {data && (
          <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{data.document.page_count ?? "—"} pages</span>
                  {data.document.doc_date && (<><span>·</span><Calendar className="h-4 w-4" /><span>{data.document.doc_date}</span></>)}
                  {data.document.ocr_used && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">OCR</span>
                  )}
                </div>
                <h1 className="mt-2 font-serif text-3xl font-semibold">{data.document.filename}</h1>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  to="/chat"
                  search={{ documentId: id } as any}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                >
                  <MessageSquare className="h-3 w-3" /> Chat
                </Link>
                {data.fileUrl && (
                  <a href={data.fileUrl} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent">
                    <ExternalLink className="h-3 w-3" /> Original
                  </a>
                )}
              </div>
            </div>

            {data.document.status === "processing" && (
              <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{STAGE_LABEL[(data.document.progress as any)?.stage ?? "queued"]}</span>
                  {(data.document.progress as any)?.note && (
                    <span className="text-xs">— {(data.document.progress as any).note}</span>
                  )}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${(data.document.progress as any)?.pct ?? 5}%` }} />
                </div>
              </div>
            )}
            {data.document.status === "error" && (
              <p className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {data.document.error}
              </p>
            )}

            {data.document.summary && (
              <section className="mt-8 rounded-xl border border-border bg-card p-6">
                <h2 className="font-serif text-xl font-semibold">Summary</h2>
                <p className="mt-3 text-sm leading-relaxed text-foreground/90">{data.document.summary}</p>
              </section>
            )}

            {Array.isArray(data.document.entities) && data.document.entities.length > 0 && (
              <section className="mt-6 rounded-xl border border-border bg-card p-6">
                <h2 className="flex items-center gap-2 font-serif text-xl font-semibold"><Tag className="h-4 w-4" /> Entities</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(data.document.entities as any[]).map((e, i) => (
                    <span key={i}
                          className={`rounded-md px-2 py-1 text-xs font-medium ${ENTITY_COLORS[e.type] ?? ENTITY_COLORS.OTHER}`}>
                      {e.name}<span className="ml-1 opacity-60">{e.type}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {data.document.status === "ready" && (
              <section className="mt-6 rounded-xl border border-border bg-card p-6">
                <h2 className="font-serif text-xl font-semibold">Find within this document</h2>
                <form onSubmit={runFind} className="mt-3 flex gap-2">
                  <div className="relative flex-1">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="What does this say about…"
                      className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <button type="submit" disabled={searching}
                          className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
                  </button>
                </form>
                {snippets.length > 0 && (
                  <ul className="mt-4 space-y-3">
                    {snippets.map((s) => (
                      <li key={s.id} className="rounded-md border border-border bg-background p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>chunk {s.chunk_index}</span>
                          <span className="font-mono text-primary">{(s.similarity * 100).toFixed(1)}%</span>
                        </div>
                        <p className="leading-relaxed text-foreground/90">
                          <HighlightedText text={s.content} entities={(data.document.entities as any[]) ?? []} snippetTerms={snippetTerms} />
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {data.document.full_text && (
              <section className="mt-6 rounded-xl border border-border bg-card p-6">
                <h2 className="font-serif text-xl font-semibold">Extracted text</h2>
                <div className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  <HighlightedText
                    text={data.document.full_text}
                    entities={(data.document.entities as any[]) ?? []}
                    snippetTerms={snippetTerms}
                  />
                </div>
              </section>
            )}

            <div className="mt-8 flex gap-3">
              <Link to="/search" className="text-sm text-primary hover:underline">← Back to search</Link>
              <Link to="/chat" className="text-sm text-primary hover:underline">Chat with archive →</Link>
            </div>
          </motion.article>
        )}
      </main>
    </div>
  );
}
