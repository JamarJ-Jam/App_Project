import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config';
import { supabaseStorage } from './supabaseStorage';
import { initializeCryptoFoundation, isCryptoReady } from './cryptoFoundation';

let client: SupabaseClient | undefined;

/**
 * Async gate: initialize crypto, then get/create Supabase client
 */
export const getSupabaseClient = async (): Promise<SupabaseClient> => {
  await initializeCryptoFoundation();
  if (!isCryptoReady()) throw new Error('Crypto foundation is unavailable');

  if (client) {
    return client;
  }

  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      'Supabase Auth is not configured. Set the public Supabase environment variables before using this client.'
    );
  }

  client = createClient(config.url, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: supabaseStorage,
    },
  });

  return client;
};