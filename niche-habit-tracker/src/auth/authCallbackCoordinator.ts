import type { Session } from '@supabase/supabase-js';
// @ts-expect-error Native Node test loading requires the explicit TypeScript extension.
import { parseAuthCallbackUrl, type AuthCallbackParseResult, type AuthCallbackIntent } from './authRedirect.ts';

export type CallbackResult =
  | { status: 'authenticated' }
  | { status: 'verification_required' }
  | { status: 'recovery' }
  | { status: 'failed'; reason: 'invalid_callback' | 'verification_failed' | 'device_verifier_missing' | 'conflicting_identity' | 'stale_operation' | 'bootstrap_failed' | 'recovery_not_supported' | 'recovery_evidence_mismatch'; intent?: 'recovery' }
  | { status: 'replayed'; reason: 'replayed'; intent?: 'recovery' };

type ReconcileResult = { status: 'authenticated' | 'verification_required' };
type ReconcileSession = (session: Session) => Promise<ReconcileResult>;
type ExchangeCode = (code: string) => Promise<{
  data: { session: Session | null; redirectType?: string | null };
  error: { code?: string; message?: string } | null;
}>;

type CallbackDependencies = {
  exchangeCode: ExchangeCode;
  reconcileSession: ReconcileSession;
  getCurrentSession?: () => Promise<Session | null>;
  beforeExchange?: (baseline: Session | null) => Promise<void>;
  admitSession?: (session: Session, redirectType?: string | null, intent?: AuthCallbackIntent) => Promise<CallbackResult | null>;
};

type CallbackOperation = {
  generation: number;
  code: string;
  intent?: AuthCallbackIntent;
  deferEvents: boolean;
  baselineIdentity: string | null;
  eventResult: Promise<CallbackResult> | null;
  promise: Promise<CallbackResult>;
};

const staleResult = (): CallbackResult => ({ status: 'failed', reason: 'stale_operation' });

const safeExchangeFailure = (error: { code?: string; message?: string }): CallbackResult => {
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (text.includes('code_verifier') || text.includes('code verifier') || text.includes('pkce')) {
    return { status: 'failed', reason: 'device_verifier_missing' };
  }
  return { status: 'failed', reason: 'verification_failed' };
};

export class AuthCallbackCoordinator {
  private generation = 0;
  private activeOperation: CallbackOperation | null = null;
  private readonly consumedCodes = new Set<string>();

  cancel(): void {
    this.generation += 1;
    this.activeOperation = null;
  }

  isProcessing(): boolean {
    return this.activeOperation !== null;
  }

  hasConsumedCode(code: string): boolean {
    return this.consumedCodes.has(code);
  }

  process(incomingUrl: string, dependencies: CallbackDependencies): Promise<CallbackResult> {
    const parsed = parseAuthCallbackUrl(incomingUrl);
    if (parsed.kind === 'invalid') return Promise.resolve({ status: 'failed', reason: 'invalid_callback', ...(parsed.intent ? { intent: parsed.intent } : {}) });
    if (parsed.kind === 'error') return Promise.resolve({ status: 'failed', reason: 'verification_failed' });
    const intent = parsed.kind === 'recovery' ? 'recovery' : parsed.intent;
    const resultIntent = intent === 'recovery' ? { intent: 'recovery' as const } : {};
    if (intent === 'recovery' && (!dependencies.beforeExchange || !dependencies.admitSession)) {
      return Promise.resolve({ status: 'failed', reason: 'recovery_not_supported', ...resultIntent });
    }
    if (this.activeOperation?.code === parsed.code) {
      return this.activeOperation.intent === intent ? this.activeOperation.promise
        : Promise.resolve({ status: 'failed', reason: 'recovery_evidence_mismatch', intent: 'recovery' });
    }
    if (this.consumedCodes.has(parsed.code)) return Promise.resolve({ status: 'replayed', reason: 'replayed', ...resultIntent });

    if (this.activeOperation) this.cancel();
    const generation = ++this.generation;
    this.consumedCodes.add(parsed.code);

    let resolveOperation: (result: CallbackResult) => void = () => {};
    const operationPromise = new Promise<CallbackResult>((resolve) => {
      resolveOperation = (result) => resolve(result.status === 'failed' || result.status === 'replayed'
        ? { ...result, ...resultIntent } : result);
    });
    const operation: CallbackOperation = {
      generation,
      code: parsed.code,
      intent,
      deferEvents: Boolean(dependencies.admitSession),
      baselineIdentity: null,
      eventResult: null,
      promise: operationPromise,
    };
    this.activeOperation = operation;

    void (async () => {
      try {
        const currentSession = await dependencies.getCurrentSession?.();
        operation.baselineIdentity = currentSession?.user.id ?? null;
        if (!this.isCurrent(operation)) { resolveOperation(staleResult()); return; }
        await dependencies.beforeExchange?.(currentSession ?? null);
      } catch {
        if (dependencies.getCurrentSession || dependencies.beforeExchange) {
          resolveOperation({ status: 'failed', reason: 'verification_failed' });
          if (this.activeOperation === operation) this.activeOperation = null;
          return;
        }
      }

      if (!this.isCurrent(operation)) {
        resolveOperation(staleResult());
        return;
      }

      try {
        resolveOperation(await this.runOperation(operation, dependencies));
      } catch {
        resolveOperation({ status: 'failed', reason: 'verification_failed' });
      }
    })();

    return operationPromise;
  }

  handleAuthEvent(session: Session | null, reconcileSession: ReconcileSession): boolean {
    const operation = this.activeOperation;
    if (!operation || !this.isCurrent(operation)) return false;
    // Admission must see the completed SDK exchange before any reconciliation.
    if (operation.deferEvents) return true;
    if (!session) return true;

    if (operation.baselineIdentity && operation.baselineIdentity !== session.user.id) {
      operation.eventResult = Promise.resolve({ status: 'failed', reason: 'conflicting_identity' });
      return true;
    }

    if (!operation.eventResult) {
      operation.eventResult = reconcileSession(session)
        .then((result) => result)
        .catch(() => ({ status: 'failed', reason: 'bootstrap_failed' }));
    }
    return true;
  }

  private isCurrent(operation: CallbackOperation): boolean {
    return this.activeOperation === operation && this.generation === operation.generation;
  }

  private async runOperation(
    operation: CallbackOperation,
    dependencies: CallbackDependencies,
  ): Promise<CallbackResult> {
    try {
      const exchange = await dependencies.exchangeCode(operation.code);
      if (!this.isCurrent(operation)) return staleResult();
      if (exchange.error) return safeExchangeFailure(exchange.error);

      const session = exchange.data.session;
      if (!session) {
        return { status: 'failed', reason: 'verification_failed' };
      }
      if (operation.baselineIdentity && operation.baselineIdentity !== session.user.id) {
        return { status: 'failed', reason: 'conflicting_identity' };
      }

      if (exchange.data.redirectType === 'recovery' && !dependencies.admitSession) {
        return { status: 'failed', reason: 'recovery_evidence_mismatch', intent: 'recovery' };
      }
      const admission = await dependencies.admitSession?.(session, exchange.data.redirectType, operation.intent);
      if (!this.isCurrent(operation)) return staleResult();
      if ((operation.intent === 'recovery' && admission?.status !== 'recovery' && admission?.status !== 'failed') ||
          (operation.intent === 'signup' && admission?.status === 'recovery')) {
        return { status: 'failed', reason: 'recovery_evidence_mismatch', intent: 'recovery' };
      }
      if (admission) return admission;

      if (operation.eventResult) return await operation.eventResult;
      const result = await dependencies.reconcileSession(session);
      if (!this.isCurrent(operation)) return staleResult();
      return result;
    } catch {
      if (!this.isCurrent(operation)) return staleResult();
      return { status: 'failed', reason: 'verification_failed' };
    } finally {
      if (this.activeOperation === operation) this.activeOperation = null;
    }
  }
}

export const callbackResultFromParse = (parsed: AuthCallbackParseResult): CallbackResult | null =>
  parsed.kind === 'invalid'
    ? { status: 'failed', reason: 'invalid_callback', ...(parsed.intent ? { intent: parsed.intent } : {}) }
    : parsed.kind === 'error'
      ? { status: 'failed', reason: 'verification_failed' }
      : null;
