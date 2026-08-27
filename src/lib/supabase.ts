import { createClient, SupabaseClient } from '@supabase/supabase-js';

const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta && (import.meta as any).env
    ? (import.meta as any).env
    : {};

// Resolve URL from either NEXT_PUBLIC_* or VITE_* env vars
const rawUrl =
  env.NEXT_PUBLIC_SUPABASE_URL ||
  env.VITE_SUPABASE_URL ||
  env.VITE_PUBLIC_SUPABASE_URL ||
  (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : '') ||
  '';

// Resolve Key from either NEXT_PUBLIC_* or VITE_* env vars
const rawKey =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : '') ||
  '';

function isValidSupabaseUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed === 'admin@test.com' || trimmed.includes('@')) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidSupabaseKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed === 'admin@test' || trimmed.length < 10) return false;
  return true;
}

const supabaseUrl: string = isValidSupabaseUrl(rawUrl)
  ? rawUrl.trim()
  : 'https://rcvetyahocznanvbggqf.supabase.co';

const supabaseAnonKey: string = isValidSupabaseKey(rawKey)
  ? rawKey.trim()
  : 'sb_publishable_t1pbOZMnOqshN1IPLfOPKw_OFJFZQeM';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(isValidSupabaseUrl(supabaseUrl) && isValidSupabaseKey(supabaseAnonKey));
};

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

