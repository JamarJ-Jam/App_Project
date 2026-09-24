export const ownsOnboardingRequest = (
  currentController: AbortController | null,
  requestController: AbortController,
): boolean => currentController === requestController;