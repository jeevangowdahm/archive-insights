import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embedTexts, chatComplete } from "./ai.server";
import { chunkText } from "./chunk";

type Stage = "queued" | "extracting" | "ocr" | "chunking" | "embedding" | "summarizing" | "ready" | "error";
type Progress = { stage: Stage; pct: number; note?: string };

async function setProgress(id: string, p: Progress) {
  await supabaseAdmin.from("documents").update({ progress: p }).eq("id", id);
}

export const getDocument = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: doc, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !doc) throw new Error("Not found");
    const { data: signed } = await supabaseAdmin.storage
      .from("archive")
      .createSignedUrl(doc.storage_path, 60 * 60);
    return { document: doc, fileUrl: signed?.signedUrl ?? null };
  });

export const listDocuments = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, filename, status, progress, error, created_at, doc_date, page_count")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return { documents: data ?? [] };
});

async function extractPdfText(buf: ArrayBuffer): Promise<{ text: string; pages: number }> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text: Array.isArray(text) ? text.join("\n") : text, pages: totalPages };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Invalid PDF/i.test(msg)) {
      throw new Error("This file is not a valid PDF (corrupt or wrong format). Please upload a real PDF.");
    }
    throw e;
  }
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

// OCR fallback for scanned PDFs: send the PDF to Gemini and ask it to transcribe.
async function ocrPdfWithGemini(buf: ArrayBuffer, _filename: string): Promise<string> {
  const b64 = bufToBase64(buf);
  const dataUrl = `data:application/pdf;base64,${b64}`;
  const json = await chatComplete({
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe ALL text in this scanned document verbatim. Preserve paragraph breaks. Output only the transcribed text — no commentary." },
          { type: "image_url", image_url: { url: dataUrl } },
        ] as any,
      },
    ],
  });
  return json.choices?.[0]?.message?.content ?? "";
}

async function summarizeAndExtract(text: string) {
  const truncated = text.slice(0, 18000);
  const tools = [
    {
      type: "function",
      function: {
        name: "describe_document",
        description: "Summarize an archival document and extract entities and an estimated date.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "3-5 sentence summary." },
            doc_date: { type: "string", description: "Estimated YYYY-MM-DD or empty." },
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string", enum: ["PERSON", "ORG", "LOCATION", "DATE", "EVENT", "OTHER"] },
                },
                required: ["name", "type"],
                additionalProperties: false,
              },
            },
          },
          required: ["summary", "doc_date", "entities"],
          additionalProperties: false,
        },
      },
    },
  ];
  const json = await chatComplete({
    model: "google/gemini-3-flash-preview",
    system: "You analyze archival documents. Be concise and historically accurate.",
    messages: [{ role: "user", content: `Document text:\n\n${truncated}` }],
    tools,
    tool_choice: { type: "function", function: { name: "describe_document" } },
  });
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return { summary: "", doc_date: null as string | null, entities: [] as any[] };
  const args = JSON.parse(call.function.arguments);
  return {
    summary: args.summary as string,
    doc_date: args.doc_date && /^\d{4}-\d{2}-\d{2}$/.test(args.doc_date) ? args.doc_date : null,
    entities: args.entities as any[],
  };
}

const ProcessInput = z.object({ documentId: z.string().uuid() });

export const processDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ProcessInput.parse(d))
  .handler(async ({ data }) => {
    const sb = supabaseAdmin;
    const { data: doc, error: docErr } = await sb.from("documents").select("*").eq("id", data.documentId).single();
    if (docErr || !doc) throw new Error(`Document not found: ${docErr?.message}`);

    // Reset state for retries
    await sb.from("documents").update({
      status: "processing",
      error: null,
      progress: { stage: "queued", pct: 5 },
    }).eq("id", doc.id);

    // Clear prior chunks if reprocessing
    await sb.from("chunks").delete().eq("document_id", doc.id);

    try {
      await setProgress(doc.id, { stage: "extracting", pct: 15 });
      const { data: file, error: dlErr } = await sb.storage.from("archive").download(doc.storage_path);
      if (dlErr || !file) throw new Error(`Download failed: ${dlErr?.message}`);
      const buf = await file.arrayBuffer();

      let text = "";
      let pages = 1;
      let usedOcr = false;
      const isPdf = (doc.mime_type || "").includes("pdf") || doc.filename.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const r = await extractPdfText(buf);
        text = r.text;
        pages = r.pages;
        // Heuristic: if extracted text is empty/tiny relative to page count, treat as scanned and OCR
        if (text.replace(/\s+/g, "").length < Math.max(120, pages * 80)) {
          await setProgress(doc.id, { stage: "ocr", pct: 35, note: "Scanned PDF detected — running OCR" });
          const ocr = await ocrPdfWithGemini(buf, doc.filename);
          if (ocr && ocr.length > text.length) {
            text = ocr;
            usedOcr = true;
          }
        }
      } else if ((doc.mime_type || "").startsWith("text/")) {
        text = new TextDecoder().decode(buf);
      } else if ((doc.mime_type || "").startsWith("image/")) {
        await setProgress(doc.id, { stage: "ocr", pct: 35, note: "Image — running OCR" });
        const b64 = bufToBase64(buf);
        const dataUrl = `data:${doc.mime_type};base64,${b64}`;
        const json = await chatComplete({
          model: "google/gemini-2.5-flash",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Transcribe all text in this image verbatim." },
              { type: "image_url", image_url: { url: dataUrl } },
            ] as any,
          }],
        });
        text = json.choices?.[0]?.message?.content ?? "";
        usedOcr = true;
      } else {
        text = `[Unsupported file type: ${doc.mime_type}]`;
      }

      await setProgress(doc.id, { stage: "chunking", pct: 50 });
      const chunks = chunkText(text);

      if (chunks.length) {
        const total = chunks.length;
        for (let i = 0; i < chunks.length; i += 32) {
          const batch = chunks.slice(i, i + 32);
          const vecs = await embedTexts(batch);
          const rows = batch.map((content, j) => ({
            document_id: doc.id,
            chunk_index: i + j,
            content,
            embedding: `[${vecs[j].join(",")}]`,
          }));
          const { error: insErr } = await sb.from("chunks").insert(rows);
          if (insErr) throw new Error(`Chunk insert failed: ${insErr.message}`);
          const done = Math.min(total, i + batch.length);
          await setProgress(doc.id, {
            stage: "embedding",
            pct: 50 + Math.floor((done / total) * 30),
            note: `Embedded ${done}/${total} chunks`,
          });
        }
      }

      await setProgress(doc.id, { stage: "summarizing", pct: 85, note: "Summary + entities" });
      const meta = await summarizeAndExtract(text);

      const { error: updErr } = await sb.from("documents").update({
        full_text: text,
        page_count: pages,
        summary: meta.summary,
        entities: meta.entities,
        doc_date: meta.doc_date,
        status: "ready",
        ocr_used: usedOcr,
        error: null,
        progress: { stage: "ready", pct: 100 },
      }).eq("id", doc.id);
      if (updErr) throw new Error(`Doc update failed: ${updErr.message}`);

      return { ok: true, chunks: chunks.length, pages, ocr: usedOcr };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("documents").update({
        status: "error",
        error: msg,
        progress: { stage: "error", pct: 0, note: msg },
      }).eq("id", doc.id);
      throw e;
    }
  });

const SearchInput = z.object({
  query: z.string().min(1).max(500),
  documentId: z.string().uuid().optional(),
  matchCount: z.number().int().min(1).max(25).default(8),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const semanticSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data }) => {
    const [vec] = await embedTexts([data.query]);
    const { data: matches, error } = await supabaseAdmin.rpc("match_chunks", {
      query_embedding: `[${vec.join(",")}]` as any,
      match_count: data.matchCount,
      filter_document_id: data.documentId,
      date_from: data.dateFrom,
      date_to: data.dateTo,
    });
    if (error) throw new Error(error.message);
    const docIds = Array.from(new Set((matches ?? []).map((m: any) => m.document_id)));
    const { data: docs } = docIds.length
      ? await supabaseAdmin.from("documents").select("id, filename, summary, doc_date, entities").in("id", docIds)
      : { data: [] as any[] };
    const docMap = new Map((docs ?? []).map((d: any) => [d.id, d]));
    return {
      results: (matches ?? []).map((m: any) => ({
        ...m,
        document: docMap.get(m.document_id) ?? null,
      })),
    };
  });

// ---------- Chat sessions ----------

const ListSessionsInput = z.object({ documentId: z.string().uuid().optional() });
export const listChatSessions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListSessionsInput.parse(d))
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("chat_sessions")
      .select("id, title, document_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data.documentId) q = q.eq("document_id", data.documentId);
    else q = q.is("document_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { sessions: rows ?? [] };
  });

const CreateSessionInput = z.object({
  documentId: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
});
export const createChatSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateSessionInput.parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("chat_sessions")
      .insert({ document_id: data.documentId ?? null, title: data.title || "New conversation" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { session: row };
  });

const SessionIdInput = z.object({ sessionId: z.string().uuid() });
export const getChatSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data }) => {
    const { data: session, error: sErr } = await supabaseAdmin
      .from("chat_sessions").select("*").eq("id", data.sessionId).single();
    if (sErr || !session) throw new Error("Session not found");
    const { data: messages, error: mErr } = await supabaseAdmin
      .from("chat_messages").select("*").eq("session_id", data.sessionId).order("created_at");
    if (mErr) throw new Error(mErr.message);
    return { session, messages: messages ?? [] };
  });

export const deleteChatSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SessionIdInput.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("chat_sessions").delete().eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ChatInput = z.object({
  sessionId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

export const ragChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data }) => {
    const sb = supabaseAdmin;

    // Ensure a session exists
    let sessionId = data.sessionId;
    if (!sessionId) {
      const { data: s, error } = await sb
        .from("chat_sessions")
        .insert({
          document_id: data.documentId ?? null,
          title: data.message.slice(0, 60),
        })
        .select().single();
      if (error) throw new Error(error.message);
      sessionId = s.id;
    }

    // Load prior messages
    const { data: prior } = await sb
      .from("chat_messages").select("role, content")
      .eq("session_id", sessionId).order("created_at");
    const history = (prior ?? []).map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Persist user message
    await sb.from("chat_messages").insert({ session_id: sessionId, role: "user", content: data.message });

    // Retrieve context
    const [vec] = await embedTexts([data.message]);
    const { data: matches, error: matchErr } = await sb.rpc("match_chunks", {
      query_embedding: `[${vec.join(",")}]` as any,
      match_count: 6,
      filter_document_id: data.documentId,
    });
    if (matchErr) throw new Error(matchErr.message);

    const docIds = Array.from(new Set((matches ?? []).map((m: any) => m.document_id)));
    const { data: docs } = docIds.length
      ? await sb.from("documents").select("id, filename").in("id", docIds)
      : { data: [] as any[] };
    const docMap = new Map((docs ?? []).map((d: any) => [d.id, d.filename]));
    const context = (matches ?? [])
      .map((m: any, i: number) => `[${i + 1}] (${docMap.get(m.document_id) ?? "doc"}, chunk ${m.chunk_index})\n${m.content}`)
      .join("\n\n");

    const json = await chatComplete({
      model: "google/gemini-3-flash-preview",
      system: "You are an archival research assistant. Answer using ONLY the provided context. Cite sources inline as [1], [2], etc. If the answer is not in the context, say so plainly.",
      messages: [
        ...history,
        { role: "user", content: `Context:\n${context}\n\n---\nQuestion: ${data.message}` },
      ],
    });
    const answer: string = json.choices?.[0]?.message?.content ?? "";
    const citations = (matches ?? []).map((m: any, i: number) => ({
      index: i + 1,
      document_id: m.document_id,
      filename: docMap.get(m.document_id) ?? null,
      chunk_index: m.chunk_index,
      snippet: m.content.slice(0, 240),
    }));

    // Persist assistant message + bump session
    await sb.from("chat_messages").insert({
      session_id: sessionId, role: "assistant", content: answer, citations,
    });
    await sb.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);

    return { sessionId, answer, citations };
  });
