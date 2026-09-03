import { useEffect, useState } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/api/base44Client";

// Supabase rejects `signInWithOAuth` for any provider that isn't turned on in
// the project's Auth settings, and because the SDK does a full-page redirect
// the failure lands the user on a raw JSON error page instead of in the app.
// Asking the server which providers are live lets us render only the buttons
// that can actually work — and a provider enabled later shows up on its own.
let cached = null;

export function fetchEnabledProviders() {
  if (!cached) {
    cached = fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) =>
        json?.external
          ? Object.entries(json.external)
              .filter(([, on]) => on)
              .map(([name]) => name)
          : []
      )
      .catch(() => []);
  }
  return cached;
}

export function useProviderEnabled(provider) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchEnabledProviders().then((list) => {
      if (!cancelled) setEnabled(list.includes(provider));
    });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  return enabled;
}
