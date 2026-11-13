import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Input = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(120).optional(),
  size: z.number().int().nonnegative(),
  base64: z.string().min(1),
});

export const uploadDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${crypto.randomUUID()}-${safeName}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("archive")
      .upload(path, bin, { contentType: data.mimeType || "application/octet-stream", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: doc, error: insErr } = await supabaseAdmin
      .from("documents")
      .insert({
        filename: data.filename,
        storage_path: path,
        mime_type: data.mimeType,
        size_bytes: data.size,
        status: "processing",
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    return { id: doc.id };
  });