import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { env } from '../config/env.js';

let supabase = null;

if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
    global: { headers: { 'x-application-name': 'iqprec-server' } },
  });
} else {
  console.warn('[db] Supabase not configured — DB features disabled.');
}

export function hasDb() {
  return supabase !== null;
}

export { supabase };
export default supabase;
