export type AuthState =
  | 'loading'
  | 'unauthenticated'
  | 'guest'
  | 'verification_required'
  | 'authenticated'
  | 'bootstrap_failed';

export type RouteKind = 'public' | 'onboarding' | 'callback' | 'protected';

export type RouteDecision =
  | { type: 'hold' }
  | { type: 'allow' }
  | { type: 'redirect'; href: '/(tabs)' | '/(tabs)/dashboard' | '/auth/login' };

export const resolveRouteAccess = (
  authState: AuthState,
  routeKind: RouteKind,
): RouteDecision => {
  if (routeKind === 'callback') return { type: 'allow' };
  if (authState === 'loading') return { type: 'hold' };

  if (authState === 'unauthenticated') {
    return routeKind === 'protected' ? { type: 'redirect', href: '/(tabs)' } : { type: 'allow' };
  }

  if (authState === 'verification_required' || authState === 'bootstrap_failed') {
    return routeKind === 'public' ? { type: 'allow' } : { type: 'redirect', href: '/auth/login' };
  }

  if (authState === 'guest') {
    return routeKind === 'public' ? { type: 'redirect', href: '/(tabs)/dashboard' } : { type: 'allow' };
  }

  return routeKind === 'public'
    ? { type: 'redirect', href: '/(tabs)/dashboard' }
    : { type: 'allow' };
};

export const classifyRoute = (segments: readonly string[]): RouteKind => {
  if (segments[0] === 'auth' && segments[1] === 'callback') return 'callback';
  if (segments[0] === 'auth' && segments[1] === 'onboarding') return 'onboarding';
  if (segments[0] === 'auth') return 'public';
  if (segments[0] === '(tabs)' && (!segments[1] || segments[1] === 'index')) return 'public';
  if (segments[0] === '(tabs)') return 'protected';
  return 'public';
};