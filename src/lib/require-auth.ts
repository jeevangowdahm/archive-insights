import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side auth guard for use in route `beforeLoad`.
 * On SSR (no window) this is a no-op; the client check runs after hydration.
 */
export async function requireAuth(currentHref: string) {
  if (typeof window === "undefined") return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({ to: "/login", search: { redirect: currentHref } });
  }
}