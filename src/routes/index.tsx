import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, Upload, MessageSquare, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Neurive — Search your archive with AI" },
      { name: "description", content: "A semantic search and RAG chat system for archival documents. Upload PDFs, ask questions, get cited answers." },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-16">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            AI-powered archival research
          </div>
          <h1 className="mt-6 font-serif text-5xl font-semibold tracking-tight text-foreground md:text-6xl">
            Search your archive <br /> by meaning, not keywords.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Neurive ingests scanned reports, letters, and PDFs — then lets you search them semantically, chat with them, and surface entities and dates automatically.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-elegant)] transition-transform hover:-translate-y-0.5"
            >
              <Upload className="h-4 w-4" /> Upload documents
            </Link>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Search className="h-4 w-4" /> Try search
            </Link>
          </div>
        </motion.section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: Upload, title: "Ingest", body: "Drop in PDFs and text. Neurive extracts text, chunks it, and embeds it." },
            { icon: Search, title: "Semantic search", body: "Find passages by meaning across your entire archive — instantly." },
            { icon: MessageSquare, title: "RAG chat", body: "Ask questions and get cited answers grounded in your sources." },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="rounded-xl border border-border bg-card p-6"
            >
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-serif text-xl font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </section>
      </main>
    </div>
  );
}
