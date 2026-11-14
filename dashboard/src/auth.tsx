import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null when login is not connected yet (no Supabase project configured). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

type Access = 'checking' | 'allowed' | 'denied' | 'error';

function LoginForm({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await client.auth.signInWithPassword({ email, password });
    // One generic message, so the form does not reveal which emails exist.
    if (error) setError('Sign-in failed. Check your email and password.');
    setBusy(false);
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="brand dark">Lisgraphix<small>The Brand Builders</small></div>
        <h2>Sign in</h2>
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

/**
 * Wraps the dashboard.
 * - Login not connected: shows the dashboard in sample mode (there is no real data to protect).
 * - Connected: requires sign-in, then checks the app_users allowlist. The
 *   database enforces the same rule, so this screen is a courtesy, not the lock.
 */
export function AuthGate({ children }: { children: (ctx: { connected: boolean; email?: string; signOut?: () => void }) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [access, setAccess] = useState<Access>('checking');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    setAccess('checking');
    supabase.from('app_users').select('id').eq('auth_user_id', userId).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      setAccess(error ? 'error' : data ? 'allowed' : 'denied');
    });
    return () => { cancelled = true; };
  }, [userId]);

  if (!supabase) return <>{children({ connected: false })}</>;
  if (loading) return <div className="login"><p className="muted">Loading…</p></div>;
  if (!session) return <LoginForm client={supabase} />;

  const signOut = () => { void supabase!.auth.signOut(); };
  if (access === 'checking') return <div className="login"><p className="muted">Checking access…</p></div>;
  if (access !== 'allowed') {
    return (
      <div className="login"><div className="card">
        <h2>{access === 'denied' ? 'No access' : 'Could not check access'}</h2>
        <p className="muted">{access === 'denied'
          ? 'This account is not authorised for the Lisgraphix dashboard.'
          : 'The access check failed. Try again in a moment.'}</p>
        <button className="primary" onClick={signOut}>Sign out</button>
      </div></div>
    );
  }
  return <>{children({ connected: true, email: session.user.email, signOut })}</>;
}
