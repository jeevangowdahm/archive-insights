import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { FileUp, Loader2, CheckCircle2, AlertCircle, ArrowRight, RotateCw } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { uploadDocument } from "@/lib/upload.functions";
import { processDocument, listDocuments } from "@/lib/documents.functions";
import { requireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/upload")({
  component: UploadPage,
  beforeLoad: ({ location }) => requireAuth(location.href),
  head: () => ({
    meta: [
      { title: "Upload — Neurive" },
      { name: "description", content: "Upload archival PDFs, images, and scanned documents to your Neurive archive." },
    ],
  }),
});

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

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

function ProgressBar({ pct, stage }: { pct: number; stage: string }) {
  const error = stage === "error";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <motion.div
        className={error ? "h-full bg-destructive" : "h-full bg-primary"}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(2, pct)}%` }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}

function UploadPage() {
  const [uploading, setUploading] = useState<string[]>([]);
  const upload = useServerFn(uploadDocument);
  const process = useServerFn(processDocument);
  const list = useServerFn(listDocuments);
  const retry = useServerFn(processDocument);

  const { data, refetch } = useQuery({
    queryKey: ["doc-list"],
    queryFn: () => list(),
    refetchInterval: 2000,
  });

  const onDrop = useCallback(
    async (files: File[]) => {
      setUploading((prev) => [...files.map((f) => f.name), ...prev]);
      for (const f of files) {
        try {
          const b64 = await fileToBase64(f);
          const { id } = await upload({
            data: { filename: f.name, mimeType: f.type, size: f.size, base64: b64 },
          });
          // Kick processing in background — don't await
          process({ data: { documentId: id } }).catch(() => {});
          refetch();
        } catch (e) {
          console.error(e);
        } finally {
          setUploading((prev) => prev.filter((n) => n !== f.name));
        }
      }
    },
    [upload, process, refetch],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt", ".md"],
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
  });

  async function onRetry(id: string) {
    try {
      await retry({ data: { documentId: id } });
    } catch {}
    refetch();
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-serif text-4xl font-semibold">Upload documents</h1>
        <p className="mt-2 text-muted-foreground">
          PDFs (text or scanned), images, and plain text. Scanned PDFs are OCR'd automatically.
        </p>

        <div
          {...getRootProps()}
          className={`mt-8 cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
            isDragActive ? "border-primary bg-accent/40" : "border-border bg-card hover:bg-accent/20"
          }`}
        >
          <input {...getInputProps()} />
          <FileUp className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-4 font-medium">{isDragActive ? "Drop here…" : "Drag & drop, or click to select"}</p>
          <p className="mt-1 text-sm text-muted-foreground">PDF · image · text</p>
        </div>

        <ul className="mt-8 space-y-2">
          <AnimatePresence initial={false}>
            {uploading.map((name) => (
              <motion.li
                key={"up-" + name}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <p className="truncate font-medium">{name}</p>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading
                </span>
              </motion.li>
            ))}
            {(data?.documents ?? []).map((d: any) => {
              const stage = d.progress?.stage ?? d.status ?? "queued";
              const pct = d.progress?.pct ?? (d.status === "ready" ? 100 : 0);
              const note = d.progress?.note;
              return (
                <motion.li
                  key={d.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {STAGE_LABEL[stage] ?? stage}
                        {note ? ` — ${note}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-sm">
                      {d.status === "ready" && (
                        <Link
                          to="/document/$id"
                          params={{ id: d.id }}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <CheckCircle2 className="h-4 w-4" /> View <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                      {d.status === "error" && (
                        <>
                          <span className="flex items-center gap-1 text-destructive">
                            <AlertCircle className="h-4 w-4" /> Failed
                          </span>
                          <button
                            onClick={() => onRetry(d.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                          >
                            <RotateCw className="h-3 w-3" /> Retry
                          </button>
                        </>
                      )}
                      {d.status === "processing" && (
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      )}
                    </div>
                  </div>
                  {d.status !== "ready" && <div className="mt-2"><ProgressBar pct={pct} stage={stage} /></div>}
                  {d.error && <p className="mt-2 text-xs text-destructive">{d.error}</p>}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </main>
    </div>
  );
}
