import type { User } from '@supabase/supabase-js';

export type AuthProvider = 'email' | 'google';

export type ProviderEligibility =
  | { status: 'eligible'; provider: AuthProvider }
  | { status: 'verification_required'; provider: 'email' }
  | { status: 'unsupported_identity' };

const supportedProviders = new Set<AuthProvider>(['email', 'google']);

/**
 * Accept only Auth-owned evidence from the existing Supabase session pipeline.
 * app_metadata.provider selects the stable default, not the current method.
 * Linked identities require matching Auth-owned provider-set corroboration.
 * This is frontend admission, not token verification or account ownership.
 */
export function evaluateProviderIdentity(user: User, expectedProvider?: AuthProvider): ProviderEligibility {
  const identities = user.identities;
  if (user.is_anonymous === true || typeof user.id !== 'string' || !user.id ||
      !Array.isArray(identities) || identities.length === 0) {
    return { status: 'unsupported_identity' };
  }

  const providers = new Set<AuthProvider>();
  for (const identity of identities) {
    const provider = identity?.provider;
    if (!identity || identity.user_id !== user.id || !supportedProviders.has(provider as AuthProvider) ||
        providers.has(provider as AuthProvider)) {
      return { status: 'unsupported_identity' };
    }
    providers.add(provider as AuthProvider);
  }

  const metadata = user.app_metadata;
  const metadataProvider = metadata?.provider;
  if (!supportedProviders.has(metadataProvider as AuthProvider) ||
      !providers.has(metadataProvider as AuthProvider)) {
    return { status: 'unsupported_identity' };
  }

  const metadataProviders = metadata.providers;
  if (metadataProviders === undefined) {
    if (providers.size !== 1) return { status: 'unsupported_identity' };
  } else if (!Array.isArray(metadataProviders) || metadataProviders.length === 0) {
    return { status: 'unsupported_identity' };
  } else {
    const metadataProviderSet = new Set<AuthProvider>();
    for (const provider of metadataProviders) {
      if (!supportedProviders.has(provider as AuthProvider) || metadataProviderSet.has(provider as AuthProvider)) {
        return { status: 'unsupported_identity' };
      }
      metadataProviderSet.add(provider as AuthProvider);
    }
    if (metadataProviderSet.size !== providers.size ||
        [...metadataProviderSet].some((provider) => !providers.has(provider))) {
      return { status: 'unsupported_identity' };
    }
  }

  const provider = expectedProvider ?? metadataProvider as AuthProvider;
  if (!providers.has(provider)) return { status: 'unsupported_identity' };
  if (provider === 'email' && !Boolean(user.email_confirmed_at)) {
    return { status: 'verification_required', provider };
  }
  return { status: 'eligible', provider };
}
