import { Router } from 'express';
import { logOperationalFailure, sendInternalServerError } from './http.js';

export interface BriefingGeneration {
  text: string;
  toolResults?: readonly unknown[];
}

export type BriefingGenerator = (prompt: string) => Promise<BriefingGeneration>;

export const createBriefingRouter = (generateBriefing: BriefingGenerator): Router => {
  const router = Router();

  router.post('/api/chawgee/briefing', async (req, res) => {
    try {
      const { userContext, userQuery } = req.body;

      if (!userContext) {
        return res.status(400).json({
          success: false,
          error: 'Missing userContext',
        });
      }

      const dynamicContext = `
    CURRENT APP CONTEXT:

    ${JSON.stringify(userContext, null, 2)}

    IMPORTANT:
    This is the user's actual current app context.

    Treat every meaningful field in this context as potentially relevant, including fields or categories that may be added in the future.

    Do not invent values.
    Do not assume missing information.
    Distinguish between logged activity, goals, preferences, and unavailable data.
    Prioritize meaningful progress, changes, patterns, risks, conflicts, and opportunities.
    Do not simply repeat all of the available data.
    `;

      const promptText = userQuery
        ? `${dynamicContext}

    USER REQUEST:
    ${userQuery}

    Answer the user's request using the available app context where relevant.
    `
        : `${dynamicContext}

    Generate the most useful Chawgee briefing for the user right now.

    Focus on what is most meaningful based on the available context.
    Highlight important progress, gaps, changes, or opportunities and give practical next actions when appropriate.

    Do not overwhelm the user with unnecessary information.
    `;

      const response = await generateBriefing(promptText);

      res.json({
        success: true,
        chawgeeInsight: response.text,
        toolResults: response.toolResults || [],
      });
    } catch {
      logOperationalFailure('Chawgee briefing request');
      sendInternalServerError(res);
    }
  });

  return router;
};