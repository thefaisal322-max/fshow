/**
 * Supabase project address and public key.
 *
 * supabase.com → your project → Project Settings → API (or "Connect"):
 *   - Project URL                → SUPABASE_URL
 *   - Publishable key (or anon)  → SUPABASE_KEY
 *
 * Both are PUBLIC by design (every Supabase app ships them inside the APK).
 * Security comes from Row Level Security in supabase/migrations, not from hiding these.
 * They can also be set at build time: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://jqkyihnvidbehrapfflt.supabase.co';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY || 'PASTE_PUBLISHABLE_KEY';
