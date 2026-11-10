"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Whether the visitor is signed in, for the public website pages (so a
// signed-in seller sees "Open ProfitSync" instead of "Start free").
// Starts false so the page matches what the server sent, then updates.
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (active) setSignedIn(Boolean(data.session));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return signedIn;
}
