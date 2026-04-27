import { createClient } from "@supabase/supabase-js";
import type { RuntimeApiConfig } from "@/lib/runtimeConfig";

export function getSupabaseAdmin(config: RuntimeApiConfig = {}) {
  const url = config.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = config.supabaseServiceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false
    }
  });
}
