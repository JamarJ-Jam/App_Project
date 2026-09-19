// Expo inlines this public value at build time. Never put server secrets here.
const configuredApiBaseUrl = process.env.EXPO_PUBLIC_CHAWGEE_API_BASE_URL?.trim();

const resolveApiBaseUrl = (): string => {
  const value = configuredApiBaseUrl || (__DEV__ ? 'http://192.168.0.7:4000' : '');

  if (!value) {
    throw new Error('EXPO_PUBLIC_CHAWGEE_API_BASE_URL is required outside development.');
  }

  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname || url.username || url.password || url.search || url.hash
    ) {
      throw new Error();
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new Error('EXPO_PUBLIC_CHAWGEE_API_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.');
  }
};

export const appConfig = Object.freeze({
  apiBaseUrl: resolveApiBaseUrl(),
});
