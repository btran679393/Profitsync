import { createBrowserClient } from "@supabase/ssr";
import { inDemo } from "@/lib/demo/shim";

// A stand-in for the public demo (/demo): a pretend signed-in seller whose
// settings changes are kept only in this browser tab.
function demoClient() {
  const user = {
    id: "demo-user",
    email: "demo@profitsync.app",
    user_metadata: { full_name: "Demo Seller", preferences: { setupGuideHidden: true } } as Record<string, unknown>,
  };
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      updateUser: async ({ data }: { data?: Record<string, unknown> }) => {
        Object.assign(user.user_metadata, data ?? {});
        return { data: { user }, error: null };
      },
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  } as unknown as BrowserClient;
}

function realClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
type BrowserClient = ReturnType<typeof realClient>;

export function createClient(): BrowserClient {
  if (inDemo()) return demoClient();
  return realClient();
}
