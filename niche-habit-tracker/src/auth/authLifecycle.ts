import type { AuthCallbackIntent } from './authRedirect';

export class RecoveryEvidenceMismatchError extends Error {}

export const RECOVERY_INTERRUPTION_KEY = 'chawgee.auth.callback-interruption.v1';
// Deliberately constant: this is a restriction, never a credential or a grant.
export const RECOVERY_INTERRUPTION_VALUE = '{"version":1,"status":"unresolved_callback"}';
const ADMISSION_CLEANUP_INTERRUPTION_VALUE = '{"version":1,"status":"unresolved_callback","cleanup":"admission_receipt"}';
export const ADMISSION_RECEIPT_KEY = 'chawgee.auth.admission-receipt.v1';
const ADMISSION_RECEIPT_VERSION = 1;

type InterruptionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
type SessionIdentity = { user: { id: string }; access_token: string };
export type RecoveryPhase = 'checking' | 'none' | 'processing' | 'recovery' | 'interrupted';
export type RecoveryEvidence = 'PASSWORD_RECOVERY' | 'exchange_redirect_type';

export class AuthLifecycleCoordinator {
  private generation = 0;
  private identityKey: string | null = null;
  private sessionKey: string | null = null;
  private operation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private busy = false;
  private checked = false;
  private phase: RecoveryPhase;
  private callbackOwner: number | null = null;
  private readonly evidence = new Map<string, string>();
  private baselineIdentity: string | null = null;
  private baselineSessionKey: string | null = null;
  private admittedSubject: string | null = null;
  private requiresAdmissionReceiptCleanup = false;
  private readonly interruptionStorage?: InterruptionStorage;

  constructor(interruptionStorage?: InterruptionStorage) {
    this.interruptionStorage = interruptionStorage;
    this.phase = interruptionStorage ? 'checking' : 'none';
  }

  get recoveryPhase(): RecoveryPhase { return this.phase; }
  get isBusy(): boolean { return this.busy; }
  get operationGeneration(): number { return this.operation; }
  get canReconcile(): boolean { return this.phase === 'none'; }

  /** One SDK session slot: cleanup must finish before a newer mutation can start. */
  runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      this.busy = true;
      try { return await work(); } finally { this.busy = false; }
    });
    this.queue = result.catch(() => {});
    return result;
  }

  nextOperation(): number {
    this.invalidate();
    this.operation += 1;
    // Revocation is synchronous, even if the old SDK call is still running.
    if (this.phase === 'recovery') this.phase = 'interrupted';
    return this.operation;
  }

  ownsOperation(owner: number): boolean { return owner === this.operation; }

  async checkInterruption(): Promise<void> {
    if (this.checked) return;
    this.phase = 'checking';
    try {
      const [marker, receipt] = await Promise.all([
        this.interruptionStorage?.getItem(RECOVERY_INTERRUPTION_KEY),
        this.interruptionStorage?.getItem(ADMISSION_RECEIPT_KEY),
      ]);
      // Unknown/corrupt metadata is also a restriction, not permission to proceed.
      this.phase = marker == null ? 'none' : 'interrupted';
      this.requiresAdmissionReceiptCleanup = this.isAdmissionCleanupInterruption(marker);
      this.admittedSubject = this.parseAdmissionReceipt(receipt);
      this.checked = true;
    } catch {
      this.admittedSubject = null;
      this.phase = 'interrupted';
      throw new Error('Unable to resolve authentication state.');
    }
  }

  hasAdmissionReceipt(subject: string): boolean {
    return this.admittedSubject === subject;
  }

  revokeAdmissionReceipt(): void {
    this.admittedSubject = null;
  }

  async beginAdmission(owner: number): Promise<void> {
    if (!this.busy || !this.canReconcile || !this.ownsOperation(owner)) {
      throw new Error('Authentication operation is no longer current.');
    }
    await this.clearAdmissionReceipt();
  }

  async recordAdmission(owner: number, subject: string): Promise<void> {
    if (!this.busy || !this.canReconcile || !this.ownsOperation(owner) || !subject) {
      throw new Error('Authentication operation is no longer current.');
    }
    if (!this.interruptionStorage) throw new Error('Authentication admission storage is unavailable.');
    await this.interruptionStorage.setItem(
      ADMISSION_RECEIPT_KEY,
      JSON.stringify({ version: ADMISSION_RECEIPT_VERSION, subject }),
    );
    if (!this.busy || !this.canReconcile || !this.ownsOperation(owner)) {
      await this.interruptionStorage.removeItem(ADMISSION_RECEIPT_KEY);
      throw new Error('Authentication operation is no longer current.');
    }
    this.admittedSubject = subject;
  }

  async clearAdmissionReceipt(): Promise<void> {
    this.revokeAdmissionReceipt();
    if (!this.interruptionStorage) throw new Error('Authentication admission storage is unavailable.');
    await this.interruptionStorage.removeItem(ADMISSION_RECEIPT_KEY);
  }

  async beginCallback(owner: number, baseline: SessionIdentity | null): Promise<void> {
    if (!this.busy || !this.canReconcile || !this.ownsOperation(owner)) {
      throw new Error('Authentication operation is no longer current.');
    }
    this.invalidate();
    this.phase = 'processing';
    this.callbackOwner = owner;
    this.baselineIdentity = baseline?.user.id ?? null;
    this.baselineSessionKey = baseline?.access_token ?? null;
    this.evidence.clear();
    try {
      // Must complete BEFORE exchangeCodeForSession can persist anything.
      if (!this.interruptionStorage) throw new Error('Authentication interruption storage is unavailable.');
      await this.interruptionStorage.setItem(RECOVERY_INTERRUPTION_KEY, RECOVERY_INTERRUPTION_VALUE);
    } catch {
      this.phase = 'interrupted';
      throw new Error('Unable to protect authentication state.');
    }
  }

  recordRecoveryEvidence(owner: number, session: SessionIdentity, _source: RecoveryEvidence): void {
    if (this.callbackOwner !== owner || this.phase !== 'processing') return;
    // A revoked exchange still owns its SDK write until the queue drains. Keep
    // evidence for cleanup, but finishCallback cannot authorize a revoked owner.
    // Bind event evidence to the exact successful SDK result. A delayed event
    // from an older session is neither a grant nor a reason to destroy this one.
    this.evidence.set(session.access_token, session.user.id);
  }

  /** Called only with the successful SDK exchange result, never parsed URL intent. */
  async finishCallback(owner: number, session: SessionIdentity, redirectType?: string | null, intent?: AuthCallbackIntent): Promise<boolean> {
    if (!this.ownsOperation(owner) || this.callbackOwner !== owner) throw new Error('Stale callback.');
    if (this.baselineIdentity && this.baselineIdentity !== session.user.id) {
      throw new Error('Conflicting callback identity.');
    }
    const recovery = this.hasVerifiedRecoveryEvidence(owner, session, redirectType, intent);
    if (recovery) {
      this.phase = 'recovery';
      this.invalidate();
      return true;
    }
    await this.interruptionStorage?.removeItem(RECOVERY_INTERRUPTION_KEY);
    this.phase = 'none';
    this.callbackOwner = null;
    this.evidence.clear();
    return false;
  }

  hasVerifiedRecoveryEvidence(owner: number, session: SessionIdentity, redirectType?: string | null, intent?: AuthCallbackIntent): boolean {
    if (!this.ownsOperation(owner) || this.callbackOwner !== owner) throw new Error('Stale callback.');
    if (redirectType === 'recovery') this.recordRecoveryEvidence(owner, session, 'exchange_redirect_type');
    const recovery = this.evidence.get(session.access_token) === session.user.id;
    if ((intent === 'recovery' && !recovery) || (intent === 'signup' && recovery) ||
        (recovery && redirectType != null && redirectType !== 'recovery')) {
      // Keep the restriction/marker intact until the existing owned cleanup.
      throw new RecoveryEvidenceMismatchError('Callback recovery evidence does not match.');
    }
    return recovery;
  }

  /** Unexpected SDK recovery evidence restricts access but never grants admission. */
  async interruptSession(requiresAdmissionReceiptCleanup = false): Promise<void> {
    if (!this.busy) throw new Error('Authentication interruption requires session ownership.');
    this.phase = 'interrupted';
    this.invalidate();
    this.requiresAdmissionReceiptCleanup = requiresAdmissionReceiptCleanup;
    if (!this.interruptionStorage) throw new Error('Authentication interruption storage is unavailable.');
    await this.interruptionStorage.setItem(
      RECOVERY_INTERRUPTION_KEY,
      requiresAdmissionReceiptCleanup ? ADMISSION_CLEANUP_INTERRUPTION_VALUE : RECOVERY_INTERRUPTION_VALUE,
    );
  }

  isUnchangedCallbackSession(session: SessionIdentity): boolean {
    return this.callbackOwner !== null && this.phase !== 'recovery' &&
      this.baselineIdentity === session.user.id && this.baselineSessionKey === session.access_token &&
      this.evidence.get(session.access_token) !== session.user.id;
  }

  /** Only inside the same serial boundary used for every new login/session write. */
  async resolveInterruption(
    clearSdkSession: () => Promise<void>,
    clearAdmissionReceipt?: () => Promise<void>,
  ): Promise<void> {
    if (!this.busy) throw new Error('Authentication cleanup requires session ownership.');
    if (this.canReconcile) return;
    this.phase = 'interrupted';
    this.invalidate();
    let cleanupError: unknown;
    if (this.requiresAdmissionReceiptCleanup && clearAdmissionReceipt) {
      try { await clearAdmissionReceipt(); } catch (error) { cleanupError = error; }
    }
    try { await clearSdkSession(); } catch (error) { cleanupError ??= error; }
    if (cleanupError) throw cleanupError;
    // A crash or failed deletion before this point keeps startup restricted.
    await this.interruptionStorage?.removeItem(RECOVERY_INTERRUPTION_KEY);
    this.callbackOwner = null;
    this.evidence.clear();
    this.requiresAdmissionReceiptCleanup = false;
    this.phase = 'none';
  }

  beginSession(identityKey: string, sessionKey: string): number {
    if (this.identityKey !== identityKey || this.sessionKey !== sessionKey) {
      this.generation += 1;
      this.identityKey = identityKey;
      this.sessionKey = sessionKey;
    }

    return this.generation;
  }

  invalidate(): number {
    this.generation += 1;
    this.identityKey = null;
    this.sessionKey = null;
    return this.generation;
  }

  isCurrent(generation: number, identityKey: string, sessionKey: string): boolean {
    return generation === this.generation &&
      identityKey === this.identityKey &&
      sessionKey === this.sessionKey;
  }

  private parseAdmissionReceipt(receipt: string | null | undefined): string | null {
    if (!receipt) return null;
    try {
      const parsed = JSON.parse(receipt) as { version?: unknown; subject?: unknown };
      return parsed.version === ADMISSION_RECEIPT_VERSION && typeof parsed.subject === 'string' && parsed.subject
        ? parsed.subject
        : null;
    } catch {
      return null;
    }
  }

  private isAdmissionCleanupInterruption(marker: string | null | undefined): boolean {
    if (!marker) return false;
    try {
      const parsed = JSON.parse(marker) as { version?: unknown; status?: unknown; cleanup?: unknown };
      return parsed.version === 1 && parsed.status === 'unresolved_callback' && parsed.cleanup === 'admission_receipt';
    } catch {
      return false;
    }
  }
}
