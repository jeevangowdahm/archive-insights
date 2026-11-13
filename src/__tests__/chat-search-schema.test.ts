import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror of the schema in src/routes/chat.tsx. We duplicate it here instead of
// importing the route module so the test can run without TanStack Start's
// route plugin / SSR wiring.
const searchSchema = z.object({
  documentId: z.string().uuid().optional().catch(undefined),
  sessionId: z.string().uuid().optional().catch(undefined),
});

describe("chat searchSchema", () => {
  it("accepts a valid uuid sessionId", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(searchSchema.parse({ sessionId: id })).toEqual({ sessionId: id });
  });

  it("resets an invalid sessionId to undefined", () => {
    const out = searchSchema.parse({ sessionId: "not-a-uuid" });
    expect(out.sessionId).toBeUndefined();
  });

  it("resets an invalid documentId to undefined", () => {
    const out = searchSchema.parse({ documentId: "garbage" });
    expect(out.documentId).toBeUndefined();
  });

  it("treats missing fields as undefined", () => {
    expect(searchSchema.parse({})).toEqual({
      documentId: undefined,
      sessionId: undefined,
    });
  });

  it("syncs sessionId changes through the schema (URL round-trip)", () => {
    const a = "22222222-2222-4222-8222-222222222222";
    const b = "33333333-3333-4333-8333-333333333333";
    const first = searchSchema.parse({ sessionId: a });
    const second = searchSchema.parse({ ...first, sessionId: b });
    expect(second.sessionId).toBe(b);
    expect(second.sessionId).not.toBe(first.sessionId);
  });
});