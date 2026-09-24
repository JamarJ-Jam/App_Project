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
  userContext?: any;
  userQuery?: string;
}

export interface BriefingResponse {
  success: boolean;
  chawgeeInsight: string;
  toolResults?: any[];
  error?: string;
}

export const fetchChawgeeBriefing = async (
  payload: BriefingRequestPayload = {}
): Promise<BriefingResponse> => {
  try {
    const response = await fetch(
      `${appConfig.apiBaseUrl}/api/chawgee/briefing`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: BriefingResponse = await response.json();

    return data;
  } catch (err: any) {
    console.error(
      'Failed to fetch from Chawgee AI Backend:',
      err
    );

    return {
      success: false,
      chawgeeInsight: '',
      error:
        err.message ||
        'Network fetch failed',
    };
  }
};
