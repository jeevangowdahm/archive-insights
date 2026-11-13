import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, Quote, Plus, Trash2, MessageSquare } from "lucide-react";
import { z } from "zod";
import { SiteHeader } from "@/components/SiteHeader";
import { requireAuth } from "@/lib/require-auth";
import {
  ragChat,
  listChatSessions,
  getChatSession,
  createChatSession,
  deleteChatSession,
} from "@/lib/documents.functions";

// Invalid uuids are reset to undefined instead of throwing — keeps the
// chat route resilient to stale or hand-edited URLs.
export const searchSchema = z.object({
  documentId: z.string().uuid().optional().catch(undefined),
  sessionId: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  validateSearch: searchSchema,
  beforeLoad: ({ location }) => requireAuth(location.href),
  head: () => ({
    meta: [
      { title: "Chat — Neurive" },
      { name: "description", content: "Persistent conversations grounded in your archive." },
    ],
  }),
});

type Msg = { role: "user" | "assistant"; content: string; citations?: any[] };

function ChatPage() {
  const { documentId, sessionId: urlSessionId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const chat = useServerFn(ragChat);
  const list = useServerFn(listChatSessions);
  const load = useServerFn(getChatSession);
  const create = useServerFn(createChatSession);
  const del = useServerFn(deleteChatSession);

  const [sessionId, setSessionId] = useState<string | undefined>(urlSessionId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sessionsQ = useQuery({
    queryKey: ["chat-sessions", documentId ?? "global"],
    queryFn: () => list({ data: { documentId } }),
  });

  useEffect(() => {
    setSessionId(urlSessionId);
  }, [urlSessionId]);

  useEffect(() => {
    if (!sessionId) { setMessages([]); return; }
    load({ data: { sessionId } }).then((r) => {
      setMessages((r.messages as any[]).map((m) => ({
        role: m.role, content: m.content, citations: m.citations ?? undefined,
      })));
    }).catch(() => setMessages([]));
  }, [sessionId, load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function newSession() {
    const { session } = await create({ data: { documentId } });
    setSessionId(session.id);
    setMessages([]);
    navigate({ search: (s: z.infer<typeof searchSchema>) => ({ ...s, sessionId: session.id }) });
    sessionsQ.refetch();
  }

  async function pickSession(id: string) {
    setSessionId(id);
    navigate({ search: (s: z.infer<typeof searchSchema>) => ({ ...s, sessionId: id }) });
  }

  async function removeSession(id: string) {
    await del({ data: { sessionId: id } });
    if (sessionId === id) {
      setSessionId(undefined);
      setMessages([]);
      navigate({ search: (s: z.infer<typeof searchSchema>) => ({ ...s, sessionId: undefined }) });
    }
    sessionsQ.refetch();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const r = await chat({ data: { sessionId, documentId, message: text } });
      if (!sessionId) {
        setSessionId(r.sessionId);
        navigate({ search: (s: z.infer<typeof searchSchema>) => ({ ...s, sessionId: r.sessionId }) });
        sessionsQ.refetch();
      } else {
        sessionsQ.refetch();
      }
      setMessages((prev) => [...prev, { role: "assistant", content: r.answer, citations: r.citations }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "failed"}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-4 py-8 md:grid-cols-[260px_1fr]">
        {/* Sessions sidebar */}
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold">Conversations</h2>
            <button onClick={newSession} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
              <Plus className="h-3 w-3" /> New
            </button>
          </div>
          {documentId && (
            <p className="text-xs text-muted-foreground">Scoped to one document.</p>
          )}
          <ul className="space-y-1">
            {(sessionsQ.data?.sessions ?? []).map((s: any) => (
              <li key={s.id}
                  className={`group flex items-center justify-between rounded-md px-2 py-2 text-sm ${
                    sessionId === s.id ? "bg-accent" : "hover:bg-accent/40"
                  }`}>
                <button onClick={() => pickSession(s.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{s.title}</span>
                </button>
                <button onClick={() => removeSession(s.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
            {(sessionsQ.data?.sessions ?? []).length === 0 && (
              <li className="text-xs text-muted-foreground">No conversations yet.</li>
            )}
          </ul>
        </aside>

        {/* Chat panel */}
        <section className="flex min-h-[60vh] flex-col">
          <h1 className="font-serif text-3xl font-semibold">
            {documentId ? "Chat with this document" : "Chat with the archive"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Answers are grounded in your sources and cited inline. History is saved automatically.</p>

          <div ref={scrollRef} className="mt-6 flex-1 space-y-4 overflow-y-auto pr-2">
            {messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Try: <em>"What does the archive say about the 1923 land survey?"</em>
              </div>
            )}
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                          className={m.role === "user" ? "flex justify-end" : ""}>
                <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3 text-xs">
                      {m.citations.map((c: any) => (
                        <Link key={c.index} to="/document/$id" params={{ id: c.document_id }}
                              className="flex items-start gap-2 text-muted-foreground hover:text-foreground">
                          <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            <span className="font-mono text-primary">[{c.index}]</span> {c.filename} —{" "}
                            <span className="italic">{c.snippet}…</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
          </div>

          <form onSubmit={send} className="mt-6 flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)}
                   placeholder="Ask the archive…"
                   className="flex-1 rounded-md border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary" />
            <button type="submit" disabled={loading || !input.trim()}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50">
              <Send className="h-4 w-4" /> Send
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
