// Expo inlines this public value at build time. Never put server secrets here.
const configuredApiBaseUrl = process.env.EXPO_PUBLIC_CHAWGEE_API_BASE_URL?.trim();

const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const configuredSupabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const validateChawgeeApiBaseUrl = (value: string, isDevelopment = __DEV__): string => {
  try {
    const url = new URL(value);
    if (
      (!isDevelopment && url.protocol !== 'https:') ||
      (isDevelopment && !['http:', 'https:'].includes(url.protocol)) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new Error('EXPO_PUBLIC_CHAWGEE_API_BASE_URL must be an HTTPS URL outside development, without credentials, query, or fragment.');
  }
};

export const assertChawgeeApiTransport = (value: string): void => {
  validateChawgeeApiBaseUrl(value);
};

const resolveApiBaseUrl = (): string => {
  const value = configuredApiBaseUrl || (__DEV__ ? 'http://192.168.0.7:4000' : '');

  if (!value) {
    throw new Error('EXPO_PUBLIC_CHAWGEE_API_BASE_URL is required outside development.');
  }

  return validateChawgeeApiBaseUrl(value);
};
const resolveSupabaseUrl = (value: string): string => {
  try {
    const url = new URL(value);
    const isLocalDevelopmentUrl =
      __DEV__ &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

    if (
      (!isLocalDevelopmentUrl && url.protocol !== 'https:') ||
      (isLocalDevelopmentUrl && !['http:', 'https:'].includes(url.protocol)) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS URL without credentials, query, or fragment.'
    );
  }
};

const resolveSupabasePublishableKey = (value: string): string => {
  if (!value || /[\u0000-\u001f\u007f\s]/.test(value)) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a non-empty public key without whitespace.'
    );
  }

  return value;
};

export const appConfig = Object.freeze({
  apiBaseUrl: resolveApiBaseUrl(),
});

export const getSupabaseConfig = () => {
  if (!configuredSupabaseUrl && !configuredSupabasePublishableKey) {
    return undefined;
  }

  if (!configuredSupabaseUrl || !configuredSupabasePublishableKey) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be configured together.'
    );
  }

  return Object.freeze({
    url: resolveSupabaseUrl(configuredSupabaseUrl),
    publishableKey: resolveSupabasePublishableKey(configuredSupabasePublishableKey),
  });
};
