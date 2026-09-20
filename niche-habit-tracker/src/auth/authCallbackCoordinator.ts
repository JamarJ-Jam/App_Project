import type { Session } from '@supabase/supabase-js';
// @ts-expect-error Native Node test loading requires the explicit TypeScript extension.
import { parseAuthCallbackUrl, type AuthCallbackParseResult } from './authRedirect.ts';

export type CallbackResult =
  | { status: 'authenticated' }
  | { status: 'verification_required' }
  | { status: 'failed'; reason: 'invalid_callback' | 'verification_failed' | 'device_verifier_missing' | 'conflicting_identity' | 'stale_operation' | 'bootstrap_failed' | 'recovery_not_supported' }
  | { status: 'replayed'; reason: 'replayed' };

type ReconcileResult = { status: 'authenticated' | 'verification_required' };
type ReconcileSession = (session: Session) => Promise<ReconcileResult>;
type ExchangeCode = (code: string) => Promise<{
  data: { session: Session | null };
  error: { code?: string; message?: string } | null;
}>;

type CallbackDependencies = {
  exchangeCode: ExchangeCode;
  reconcileSession: ReconcileSession;
  getCurrentSession?: () => Promise<Session | null>;
};

type CallbackOperation = {
  generation: number;
  code: string;
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

  process(incomingUrl: string, dependencies: CallbackDependencies): Promise<CallbackResult> {
    const parsed = parseAuthCallbackUrl(incomingUrl);
    if (parsed.kind === 'invalid') return Promise.resolve({ status: 'failed', reason: 'invalid_callback' });
    if (parsed.kind === 'recovery') return Promise.resolve({ status: 'failed', reason: 'recovery_not_supported' });
    if (parsed.kind === 'error') return Promise.resolve({ status: 'failed', reason: 'verification_failed' });
    if (this.activeOperation?.code === parsed.code) return this.activeOperation.promise;
    if (this.consumedCodes.has(parsed.code)) return Promise.resolve({ status: 'replayed', reason: 'replayed' });

    if (this.activeOperation) this.cancel();
    const generation = ++this.generation;
    this.consumedCodes.add(parsed.code);

    let resolveOperation: (result: CallbackResult) => void = () => {};
    const operationPromise = new Promise<CallbackResult>((resolve) => {
      resolveOperation = resolve;
    });
    const operation: CallbackOperation = {
      generation,
      code: parsed.code,
      baselineIdentity: null,
      eventResult: null,
      promise: operationPromise,
    };
    this.activeOperation = operation;

    void (async () => {
      try {
        const currentSession = await dependencies.getCurrentSession?.();
        operation.baselineIdentity = currentSession?.user.id ?? null;
      } catch {
        if (dependencies.getCurrentSession) {
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
      if (!session) return { status: 'failed', reason: 'verification_failed' };
      if (operation.baselineIdentity && operation.baselineIdentity !== session.user.id) {
        return { status: 'failed', reason: 'conflicting_identity' };
      }

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
    ? { status: 'failed', reason: 'invalid_callback' }
    : parsed.kind === 'error'
      ? { status: 'failed', reason: 'verification_failed' }
      : null;
