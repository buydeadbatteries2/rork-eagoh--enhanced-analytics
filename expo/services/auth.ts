import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

/**
 * Auth service – wraps Supabase auth calls behind a clean async API so the rest
 * of the app never imports `supabase` directly for authentication.
 */

export type AuthCredentials = { email: string; password: string };
export type AuthSignupInput = AuthCredentials & { username?: string };

export async function signUpWithEmail({ email, password, username }: AuthSignupInput): Promise<{ user: User | null; session: Session | null }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: username ? { username } : undefined },
  });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function signInWithEmail({ email, password }: AuthCredentials): Promise<{ user: User | null; session: Session | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email: string, redirectTo?: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

export function onAuthStateChange(cb: (session: Session | null) => void): { unsubscribe: () => void } {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return { unsubscribe: (): void => data.subscription.unsubscribe() };
}
