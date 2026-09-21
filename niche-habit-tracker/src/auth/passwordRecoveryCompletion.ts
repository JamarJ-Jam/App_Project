export type PasswordRecoveryCompletionResult =
  | { status: 'completed' }
  | { status: 'failed'; reason: 'not_authorized' | 'invalid_password' | 'update_failed' | 'cleanup_failed' };

// Mirrors the existing signup policy exactly (non-blank only); recovery does
// not invent stricter rules. Confirmation matching is enforced by the screen.
export const isValidRecoveryPassword = (password: string): boolean => password.trim().length > 0;
