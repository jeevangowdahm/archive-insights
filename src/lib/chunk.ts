// Simple word-based chunker with overlap.
export function chunkText(text: string, size = 900, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const words = clean.split(" ");
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + size).join(" ");
    chunks.push(slice);
    if (i + size >= words.length) break;
    i += size - overlap;
  }
  return chunks;
}