import { appConfig } from '../config';

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
