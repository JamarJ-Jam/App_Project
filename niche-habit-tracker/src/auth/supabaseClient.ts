import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config';
import { supabaseStorage } from './supabaseStorage';

let client: SupabaseClient | undefined;

export const getSupabaseClient = (): SupabaseClient => {
  if (client) return client;

  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      'Supabase Auth is not configured. Set the public Supabase environment variables before using this client.'
    );
  }

  client = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: supabaseStorage,
    },
  });

  return client;
};