import express from 'express';
import cors from 'cors';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config, getServerRuntimeConfig } from './config.js';
import { CHAWGEE_SYSTEM_PROMPT } from './prompt.js';
import { agentTools } from './tools.js';
import { createBriefingRouter } from './briefingRoute.js';
import chawgeeOnboardingRoute from './chawgeeOnboardingRoute.js';
import { database } from './db/database.js';
import { createBootstrapRouter } from './auth/bootstrapRoute.js';
import {
  createIdentityResolutionMiddleware,
  createTokenAdmissionMiddleware,
} from './auth/authMiddleware.js';
import { createBootstrapSubjectLimiter } from './auth/bootstrapRateLimit.js';
import { createTokenVerifier } from './auth/tokenVerifier.js';
import { createIdentityService } from './services/identityService.js';
import {
  createReadinessHandler,
  healthHandler,
  JSON_BODY_LIMIT,
  jsonBodyErrorHandler,
} from './http.js';

const runtimeConfig = getServerRuntimeConfig();
const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey });

const app = express();

// CORS is not native-app authentication; browser-origin policy remains a later decision.
app.use(cors());
app.use(express.json({ limit: JSON_BODY_LIMIT }));

const identityService = createIdentityService(database);
let tokenVerifier: ReturnType<typeof createTokenVerifier> | undefined;
const tokenAdmissionMiddleware = createTokenAdmissionMiddleware({
  verifyAccessToken: async (token) => {
    tokenVerifier ??= createTokenVerifier(runtimeConfig.auth);
    return tokenVerifier.verify(token);
  },
});
const bootstrapSubjectLimiter = createBootstrapSubjectLimiter();
const identityResolutionMiddleware = createIdentityResolutionMiddleware({
  resolveIdentity: identityService.resolveOrProvision,
});

app.use(createBootstrapRouter(
  tokenAdmissionMiddleware,
  bootstrapSubjectLimiter,
  identityResolutionMiddleware,
));

app.use(chawgeeOnboardingRoute);

app.use(createBriefingRouter(async (prompt) => {
  const response = await generateText({
    model: openrouter('openrouter/free'),
    system: CHAWGEE_SYSTEM_PROMPT,
    prompt,
    tools: agentTools,
  });
  return { text: response.text, toolResults: response.toolResults };
}));

app.get('/health', healthHandler);

let shuttingDown = false;
app.get('/ready', createReadinessHandler(async () => !shuttingDown && database.ready()));

app.use(jsonBodyErrorHandler);

const server = app.listen(runtimeConfig.port, '0.0.0.0', () => {
  console.log(
    `⚡ Chawgee AI Agent Backend running on port ${runtimeConfig.port}`
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
