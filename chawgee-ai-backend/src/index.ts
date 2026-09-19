import express, { Request, Response } from 'express';
import cors from 'cors';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from './config.js';
import { CHAWGEE_SYSTEM_PROMPT } from './prompt.js';
import { agentTools } from './tools.js';
import chawgeeOnboardingRoute from './chawgeeOnboardingRoute.js';
import { database } from './db/database.js';
import { createBootstrapRouter } from './auth/bootstrapRoute.js';
import { createAuthenticationMiddleware } from './auth/authMiddleware.js';
import { createTokenVerifier } from './auth/tokenVerifier.js';
import { createIdentityService } from './services/identityService.js';

const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey });

const app = express();

app.use(cors());
app.use(express.json());

const identityService = createIdentityService(database);
let tokenVerifier: ReturnType<typeof createTokenVerifier> | undefined;
const authenticationMiddleware = createAuthenticationMiddleware({
  verifyAccessToken: async (token) => {
    tokenVerifier ??= createTokenVerifier();
    return tokenVerifier.verify(token);
  },
  resolveIdentity: identityService.resolveOrProvision,
});

app.use(createBootstrapRouter(authenticationMiddleware));

app.use(chawgeeOnboardingRoute);

const PORT = config.port;

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

let shuttingDown = false;
app.get('/ready', async (_req: Request, res: Response) => {
  const ready = !shuttingDown && await database.ready();
  res.status(ready && !shuttingDown ? 200 : 503).json({ success: ready && !shuttingDown });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `⚡ Chawgee AI Agent Backend running on port ${PORT}`
  );
});

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  // Stop accepting requests, drain in-flight work, then close database connections.
  const deadline = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 10000);
  deadline.unref();
  server.close(async (error) => {
    try {
      await database.close();
      process.exitCode = error ? 1 : 0;
    } catch {
      console.error('Database shutdown failed.');
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
