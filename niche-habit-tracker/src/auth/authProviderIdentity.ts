import type { User } from '@supabase/supabase-js';

export type AuthProvider = 'email' | 'google';

export type ProviderEligibility =
  | { status: 'eligible'; provider: AuthProvider }
  | { status: 'verification_required'; provider: 'email' }
  | { status: 'unsupported_identity' };

/**
 * Accept only Auth-owned evidence from the existing Supabase session pipeline.
 * app_metadata.provider is the FIRST signup provider, not the current method.
 * Until linking has its own policy, require one identity and matching metadata.
 * This is frontend admission, not token verification or account ownership.
 */
export function evaluateProviderIdentity(user: User): ProviderEligibility {
  const identities = user.identities;
  if (user.is_anonymous === true || typeof user.id !== 'string' || !user.id ||
      !Array.isArray(identities) || identities.length !== 1) {
    return { status: 'unsupported_identity' };
  }

  const identity = identities[0];
  const provider = identity?.provider;
  const metadata = user.app_metadata;
  if (!identity || identity.user_id !== user.id ||
      (provider !== 'email' && provider !== 'google') || metadata?.provider !== provider) {
    return { status: 'unsupported_identity' };
  }
  // providers is optional in the SDK. When present, it must corroborate the
  // sole identity; malformed, conflicting and linked-provider lists fail closed.
  if (metadata.providers !== undefined &&
      (!Array.isArray(metadata.providers) || metadata.providers.length !== 1 ||
       metadata.providers[0] !== provider)) {
    return { status: 'unsupported_identity' };
  }

  if (provider === 'email' && !Boolean(user.email_confirmed_at)) {
    return { status: 'verification_required', provider };
  }
  // Google evidence is its Supabase-owned identity, not an email address or
  // editable user_metadata.email_verified. Confirm this payload contract in #7A-9F.
  return { status: 'eligible', provider };
}
