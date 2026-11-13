import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Calendar, FileText, Tag, Loader2, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { getDocument } from "@/lib/documents.functions";

export const Route = createFileRoute("/document/$id")({
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

function DocPage() {
  const { id } = Route.useParams();
  const fetchDoc = useServerFn(getDocument);
  const { data, isLoading, error } = useQuery({
    queryKey: ["doc", id],
    queryFn: () => fetchDoc({ data: { id } }),
    refetchInterval: (q) => (q.state.data?.document.status === "processing" ? 2000 : false),
  });

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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{data.document.page_count ?? "—"} pages</span>
                  {data.document.doc_date && (
                    <>
                      <span>·</span>
                      <Calendar className="h-4 w-4" />
                      <span>{data.document.doc_date}</span>
                    </>
                  )}
                </div>
                <h1 className="mt-2 font-serif text-3xl font-semibold">{data.document.filename}</h1>
              </div>
              {data.fileUrl && (
                <a
                  href={data.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <ExternalLink className="h-3 w-3" /> Original
                </a>
              )}
            </div>

            {data.document.status === "processing" && (
              <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Processing — extracting text and embedding chunks…
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
                <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
                  <Tag className="h-4 w-4" /> Entities
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(data.document.entities as any[]).map((e, i) => (
                    <span
                      key={i}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${ENTITY_COLORS[e.type] ?? ENTITY_COLORS.OTHER}`}
                    >
                      {e.name}
                      <span className="ml-1 opacity-60">{e.type}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {data.document.full_text && (
              <section className="mt-6 rounded-xl border border-border bg-card p-6">
                <h2 className="font-serif text-xl font-semibold">Extracted text</h2>
                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
                  {data.document.full_text}
                </pre>
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