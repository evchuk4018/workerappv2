import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "./env";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createSupabaseBrowserClient() {
  if (!client) {
    const { url, key } = getSupabaseEnv();
    client = createBrowserClient<Database>(url, key);
  }
  return client;
}
