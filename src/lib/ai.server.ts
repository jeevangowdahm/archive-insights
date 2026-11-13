// Server-only Lovable AI helpers.
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function key() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY is not configured");
  return k;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  // The Lovable AI Gateway does not expose an embeddings endpoint for every
  // workspace, so we generate deterministic 768-dim hashed bag-of-words
  // vectors locally. Cosine similarity over these gives lexical-semantic
  // search that works with pgvector without any external API call.
  return texts.map(hashEmbed);
}

const DIMS = 768;

function hashEmbed(text: string): number[] {
  const v = new Float64Array(DIMS);
  const tokens = (text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []);
  for (const tok of tokens) {
    // unigram
    const h = fnv1a(tok);
    v[h % DIMS] += 1;
    // sign hash to spread mass
    const s = (fnv1a("s:" + tok) & 1) === 0 ? 1 : -1;
    v[(h * 2654435761) >>> 0 ? (h * 2654435761) >>> 0 % DIMS : 0] += s;
  }
  // bigrams for a bit of order sensitivity
  for (let i = 0; i < tokens.length - 1; i++) {
    const bg = tokens[i] + "_" + tokens[i + 1];
    v[fnv1a(bg) % DIMS] += 0.5;
  }
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < DIMS; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array<number>(DIMS);
  for (let i = 0; i < DIMS; i++) out[i] = v[i] / norm;
  return out;
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export async function chatComplete(opts: {
  model?: string;
  system?: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
}): Promise<any> {
  const messages = opts.system
    ? [{ role: "system", content: opts.system }, ...opts.messages]
    : opts.messages;
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3-flash-preview",
      messages,
      ...(opts.tools ? { tools: opts.tools } : {}),
      ...(opts.tool_choice ? { tool_choice: opts.tool_choice } : {}),
      ...(opts.response_format ? { response_format: opts.response_format } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Chat failed (${res.status}): ${txt}`);
  }
  return res.json();
}

export async function streamChat(messages: { role: string; content: string }[], model = "google/gemini-3-flash-preview") {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  return res;
}