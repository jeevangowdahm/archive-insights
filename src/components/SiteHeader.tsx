import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, LogIn, LogOut, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function SiteHeader() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
      setAuthLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success("Signed out.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign out failed");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
          <ScrollText className="h-5 w-5 text-primary" />
          <span>Neurive</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link to="/upload" className="text-muted-foreground transition-colors hover:text-foreground" activeProps={{ className: "text-foreground font-medium" }}>
            Upload
          </Link>
          <Link to="/search" className="text-muted-foreground transition-colors hover:text-foreground" activeProps={{ className: "text-foreground font-medium" }}>
            Search
          </Link>
          <Link to="/chat" className="text-muted-foreground transition-colors hover:text-foreground" activeProps={{ className: "text-foreground font-medium" }}>
            Chat
          </Link>
          {authLoading ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground" aria-label="Checking session">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          ) : email ? (
            <button
              onClick={signOut}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
              title={email}
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          ) : (
            <Link to="/login" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground font-medium" }}>
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}