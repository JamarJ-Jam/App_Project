import type { CallbackResult } from './authCallbackCoordinator';
// @ts-expect-error Native Node test loading requires the explicit TypeScript extension.
import { AUTH_CALLBACK_URI } from './authRedirect.ts';

export type HandoffSnapshot =
  | { status: 'waiting' | 'processing' }
  | { status: 'complete'; result: CallbackResult };

type LinkingSource = {
  getInitialURL: () => Promise<string | null>;
  addEventListener: (type: 'url', listener: (event: { url: string }) => void) => { remove: () => void };
};
type ProcessCallback = (url: string) => Promise<CallbackResult>;

/** Transport only: original strings enter AuthContext's existing admission path. */
export class AuthCallbackHandoff {
  private snapshot: HandoffSnapshot = { status: 'waiting' };
  private readonly listeners = new Set<() => void>();
  private readonly admitted = new Set<string>();
  private revision = 0;
  private connection = 0;
  private runtimeReceived = false;
  private ready = false;

  isReady = (): boolean => this.ready;

  getSnapshot = (): HandoffSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(snapshot: HandoffSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  start(linking: LinkingSource, process: ProcessCallback): () => void {
    const connection = ++this.connection;
    const receive = (url: string, source: 'initial' | 'event') => {
      if (connection !== this.connection) return;
      // Ignore unrelated navigation. This is not validation: even malformed
      // callback payloads must pass unchanged to the strict parser.
      if (!url.startsWith(AUTH_CALLBACK_URI)) return;
      if (source === 'event') this.runtimeReceived = true;
      if (source === 'initial' && this.runtimeReceived) return;
      if (this.admitted.has(url)) return;
      this.admitted.add(url);
      const revision = ++this.revision;
      this.publish({ status: 'processing' });
      void (async () => {
        let result: CallbackResult;
        try {
          result = await process(url);
        } catch {
          result = { status: 'failed', reason: 'verification_failed' };
        }
        if (revision === this.revision) this.publish({ status: 'complete', result });
      })();
    };

    // Subscribe first: a runtime event always wins over an unresolved initial read.
    const subscription = linking.addEventListener('url', ({ url }) => receive(url, 'event'));
    this.ready = true;
    this.listeners.forEach((listener) => listener());
    void linking.getInitialURL().then(
      (url) => { if (url) receive(url, 'initial'); },
      () => {},
    );
    return () => {
      if (connection === this.connection) {
        this.connection += 1;
        this.ready = false;
        this.listeners.forEach((listener) => listener());
      }
      subscription.remove();
    };
  }
}
