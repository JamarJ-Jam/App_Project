export class AuthLifecycleCoordinator {
  private generation = 0;
  private identityKey: string | null = null;
  private sessionKey: string | null = null;

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
}