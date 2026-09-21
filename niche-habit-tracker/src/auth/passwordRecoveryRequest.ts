export type PasswordRecoveryRequestResult =
  | { status: 'requested' }
  | { status: 'failed'; reason: 'invalid_email' | 'request_failed' };

export type ResetPasswordForEmail = (
  email: string,
  options: { redirectTo: string },
) => Promise<{ error: { message?: string } | null }>;

// Same shape accepted by signIn/signUp email handling: non-empty, single token, contains "@".
export const isValidRecoveryEmail = (email: string): boolean =>
  email.length > 0 && !/\s/.test(email) && email.includes('@');

// Provider errors here are operational only: Supabase never reports account
// existence from resetPasswordForEmail, so any error is a safe generic failure.
export const requestPasswordRecovery = async (
  email: string,
  redirectTo: string,
  resetPasswordForEmail: ResetPasswordForEmail,
): Promise<PasswordRecoveryRequestResult> => {
  const trimmed = email.trim();
  if (!isValidRecoveryEmail(trimmed)) return { status: 'failed', reason: 'invalid_email' };

  try {
    const { error } = await resetPasswordForEmail(trimmed, { redirectTo });
    return error ? { status: 'failed', reason: 'request_failed' } : { status: 'requested' };
  } catch {
    return { status: 'failed', reason: 'request_failed' };
  }
};
