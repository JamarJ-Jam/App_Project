import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateText } from 'ai';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { CHAWGEE_SYSTEM_PROMPT } from './prompt.js';
import { agentTools } from './tools.js';
import chawgeeOnboardingRoute from './chawgeeOnboardingRoute.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use(chawgeeOnboardingRoute);

const PORT: number = Number(process.env.PORT) || 4000;

app.post('/api/chawgee/briefing', async (req: Request, res: Response) => {
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

    const response = await generateText({
      model: openrouter('openrouter/free'),
      system: CHAWGEE_SYSTEM_PROMPT,
      prompt: promptText,
      tools: agentTools,
    });

    res.json({
      success: true,
      chawgeeInsight: response.text,
      toolResults: response.toolResults || [],
    });
  } catch (error: any) {
    console.error('Chawgee Agent Error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Chawgee backend error',
    });
  }
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Chawgee backend is alive',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `⚡ Chawgee AI Agent Backend running on port ${PORT}`
  );
});