export const AUTH_CALLBACK_URI = 'com.mychawgee:///auth/callback';

const CALLBACK_SCHEME = 'com.mychawgee:';
const CALLBACK_PATH = '/auth/callback';
const CODE_PARAMETER = 'code';
const ERROR_PARAMETERS = new Set(['error', 'error_code', 'error_description']);

export type AuthCallbackIntent = 'signup' | 'recovery';

export type AuthCallbackParseResult =
  | { kind: 'code'; code: string; intent?: 'signup' }
  | { kind: 'recovery'; code: string }
  | { kind: 'error'; reason: 'verification_failed' }
  | { kind: 'invalid'; reason: 'invalid_callback'; intent?: 'recovery' };

const invalidCallback = (intent?: 'recovery'): AuthCallbackParseResult => ({
  kind: 'invalid',
  reason: 'invalid_callback',
  ...(intent ? { intent } : {}),
});

const decodeQueryPart = (value: string): string => decodeURIComponent(value.replace(/\+/g, ' '));

const parseQueryParameters = (query: string): Map<string, string> | null => {
  const parameters = new Map<string, string>();
  if (!query) return parameters;

  for (const pair of query.split('&')) {
    if (!pair) return null;
    const separator = pair.indexOf('=');
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? '' : pair.slice(separator + 1);

    try {
      const key = decodeQueryPart(rawKey);
      const value = decodeQueryPart(rawValue);
      if (!key || parameters.has(key)) return null;
      parameters.set(key, value);
    } catch {
      return null;
    }
  }

  return parameters;
};

export const parseAuthCallbackUrl = (incomingUrl: string): AuthCallbackParseResult => {
  if (
    typeof incomingUrl !== 'string' ||
    !incomingUrl ||
    incomingUrl !== incomingUrl.trim() ||
    /[\u0000-\u0020\u007f]/u.test(incomingUrl) ||
    incomingUrl.includes('#') ||
    (incomingUrl !== AUTH_CALLBACK_URI && !incomingUrl.startsWith(`${AUTH_CALLBACK_URI}?`))
  ) return invalidCallback();

  let parsed: URL;
  try {
    parsed = new URL(incomingUrl);
  } catch {
    return invalidCallback();
  }

  if (
    parsed.protocol !== CALLBACK_SCHEME ||
    parsed.hostname !== '' ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== CALLBACK_PATH ||
    parsed.hash !== ''
  ) {
    return invalidCallback();
  }

  const parameters = parseQueryParameters(parsed.search.slice(1));
  if (!parameters) return invalidCallback();

  for (const key of parameters.keys()) {
    if (key !== CODE_PARAMETER && key !== 'type' && !ERROR_PARAMETERS.has(key)) return invalidCallback();
  }

  const intent = parameters.get('type');
  if (intent !== undefined && intent !== 'signup' && intent !== 'recovery') return invalidCallback();
  const code = parameters.get(CODE_PARAMETER);
  if (intent === 'recovery') {
    // Intent permits exchange only. SDK evidence must authorize recovery later.
    if (parameters.size !== 2 || !code || /[\s\u0000-\u001f\u007f]/u.test(code)) return invalidCallback('recovery');
    return { kind: 'recovery', code };
  }

  const error = parameters.get('error');
  if (code !== undefined && error !== undefined) return invalidCallback();

  if (code !== undefined) {
    return code ? { kind: 'code', code, ...(intent === 'signup' ? { intent } : {}) } : invalidCallback();
  }

  if (error !== undefined) {
    return error ? { kind: 'error', reason: 'verification_failed' } : invalidCallback();
  }

  return invalidCallback();
};

export const isAuthCallbackUrl = (incomingUrl: string): boolean =>
  parseAuthCallbackUrl(incomingUrl).kind !== 'invalid';
