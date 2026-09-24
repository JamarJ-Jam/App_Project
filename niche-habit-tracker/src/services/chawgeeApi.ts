import { appConfig, assertChawgeeApiTransport } from '../config';

export interface BootstrapAccount {
  id: string;
  status: 'active';
}

export interface BootstrapResponse {
  success: true;
  account: BootstrapAccount;
}

export const BOOTSTRAP_REQUEST_TIMEOUT_MS = 30_000;
export const AI_REQUEST_TIMEOUT_MS = 45_000;

export class ChawgeeAiAccessError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401
      ? 'Your authentication session is no longer valid.'
      : 'Your Chawgee account is currently restricted.');
    this.name = 'ChawgeeAiAccessError';
  }
}

export class ChawgeeAiTransientError extends Error {
  constructor() {
    super('Unable to connect to Chawgee AI backend.');
    this.name = 'ChawgeeAiTransientError';
  }
}

export const bootstrapChawgeeAccount = async (
  accessToken: string,
  externalSignal?: AbortSignal,
): Promise<BootstrapAccount> => {
  const controller = new AbortController();
  const abortForExternalSignal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortForExternalSignal, { once: true });
  const timeout = setTimeout(() => controller.abort(), BOOTSTRAP_REQUEST_TIMEOUT_MS);

  try {
    if (controller.signal.aborted) throw new Error('Bootstrap request was cancelled.');
    // Revalidate immediately before creating the bearer request.
    assertChawgeeApiTransport(appConfig.apiBaseUrl);
    const response = await fetch(`${appConfig.apiBaseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (controller.signal.aborted) throw new Error('Bootstrap request was cancelled.');

    if (response.status === 401) throw new Error('Your authentication session is no longer valid.');
    if (response.status === 403) throw new Error('Your Chawgee account is currently restricted.');
    if (!response.ok) throw new Error('Unable to initialize your Chawgee account.');

    const data = await response.json() as Partial<BootstrapResponse>;
    if (
      data.success !== true ||
      !data.account ||
      typeof data.account.id !== 'string' ||
      data.account.status !== 'active'
    ) throw new Error('Unable to initialize your Chawgee account.');
    if (controller.signal.aborted) throw new Error('Bootstrap request was cancelled.');

    return data.account;
  } catch (error) {
    if (error instanceof Error && (
      error.message === 'Your authentication session is no longer valid.' ||
      error.message === 'Your Chawgee account is currently restricted.'
    )) throw error;
    throw new Error('Unable to initialize your Chawgee account.');
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortForExternalSignal);
  }
};

export interface BriefingRequestPayload {
  userContext?: unknown;
  userQuery?: string;
}

export interface BriefingResponse {
  success: boolean;
  chawgeeInsight: string;
  toolResults?: any[];
  error?: string;
}

export interface OnboardingRequestPayload {
  message: string;
  expectedField: string;
  profile: Record<string, unknown>;
  recentMessages: { role: 'assistant' | 'user'; text: string }[];
}

export interface OnboardingResponse {
  assistantMessage: string;
  profileUpdates?: Record<string, unknown>;
  nextField: string;
  quickReplies?: string[];
  isComplete: boolean;
}

const authenticatedAiRequest = async (
  path: '/api/chawgee/onboarding' | '/api/chawgee/briefing',
  accessToken: string,
  payload: unknown,
  externalSignal?: AbortSignal,
): Promise<Response> => {
  const controller = new AbortController();
  const abortForExternalSignal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortForExternalSignal, { once: true });
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    // Validate before creating a Bearer-bearing request.
    assertChawgeeApiTransport(appConfig.apiBaseUrl);
    if (controller.signal.aborted) throw new ChawgeeAiTransientError();
    const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (controller.signal.aborted) throw new ChawgeeAiTransientError();
    if (response.status === 401 || response.status === 403) {
      throw new ChawgeeAiAccessError(response.status);
    }
    if (!response.ok) throw new ChawgeeAiTransientError();
    return response;
  } catch (error) {
    if (error instanceof ChawgeeAiAccessError) throw error;
    throw new ChawgeeAiTransientError();
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortForExternalSignal);
  }
};

export const submitChawgeeOnboarding = async (
  accessToken: string,
  payload: OnboardingRequestPayload,
  externalSignal?: AbortSignal,
): Promise<OnboardingResponse> => {
  const response = await authenticatedAiRequest(
    '/api/chawgee/onboarding',
    accessToken,
    payload,
    externalSignal,
  );
  return response.json() as Promise<OnboardingResponse>;
};

export const fetchChawgeeBriefing = async (
  accessToken: string,
  payload: BriefingRequestPayload = {},
  externalSignal?: AbortSignal,
): Promise<BriefingResponse> => {
  try {
    const response = await authenticatedAiRequest(
      '/api/chawgee/briefing',
      accessToken,
      payload,
      externalSignal,
    );
    return response.json() as Promise<BriefingResponse>;
  } catch (error) {
    if (error instanceof ChawgeeAiAccessError) throw error;
    return {
      success: false,
      chawgeeInsight: '',
      error: 'Unable to connect to Chawgee AI backend.',
    };
  }
};
