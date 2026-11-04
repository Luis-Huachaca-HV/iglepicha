// Sesión única de la app: Supabase cuando hay un proyecto conectado; si no, una cuenta demo guardada solo en este navegador.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { backendConfigured } from './backend';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/** What signUp resolves to: the new user, and whether Supabase is still waiting for the e-mail confirmation (no session yet). */
export interface SignUpResult extends SessionUser {
  needsConfirmation: boolean;
}

const CONFIRM_EMAIL_NOTICE = "Te enviamos un correo a {email}. Ábrelo y confirma tu cuenta; después vuelve aquí e inicia sesión. Si el enlace abre una página que no carga, no pasa nada: tu correo ya quedó confirmado.";
/** The notice to keep on screen after a sign-up that waits for the e-mail confirmation, in the app's language. */
export function confirmEmailNotice(email: string): string {
  return CONFIRM_EMAIL_NOTICE.replace('{email}', email);
}

export interface SessionState {
  user: SessionUser | null;
  /** Same user wrapped like a Supabase session, for code that reads session?.user. */
  session: { user: SessionUser } | null;
  loading: boolean;
  /** True while no Supabase project is connected: the account lives only in this browser. */
  demo: boolean;
}

const SESSION_KEY = 'gestion-de-pichangas-9e3639:session';
const ACCOUNTS_KEY = 'gestion-de-pichangas-9e3639:demo-accounts';
const listeners = new Set<() => void>();
let current: SessionUser | null = null;
let ready = false;
let loading: Promise<void> | null = null;

interface DemoAccount extends SessionUser {
  passwordHash: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function emit(next: SessionUser | null): void {
  current = next;
  ready = true;
  listeners.forEach((listener) => listener());
}

function fromSupabase(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): SessionUser | null {
  if (!user) return null;
  const name = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : '';
  return { id: user.id, email: user.email ?? '', name };
}

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function hash(password: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`gestion-de-pichangas-9e3639:${password}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function load(): Promise<void> {
  if (backendConfigured) {
    const { data } = await supabase.auth.getSession();
    emit(fromSupabase(data.session?.user));
    supabase.auth.onAuthStateChange((_event, session) => emit(fromSupabase(session?.user)));
    return;
  }
  emit(readJson<SessionUser | null>(SESSION_KEY, null));
}

function ensureLoaded(): Promise<void> {
  loading ??= load().catch(() => emit(null));
  return loading;
}

/** True once the local demo backend holds an account (an owner-only app creates exactly one). */
export function hasDemoAccount(): boolean {
  return readJson<DemoAccount[]>(ACCOUNTS_KEY, []).length > 0;
}

/** The signed-in user right now (null before the session loads or when signed out). */
export function getSessionUser(): SessionUser | null {
  return current;
}

export function useSession(): SessionState {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    void ensureLoaded();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { user: current, session: current ? { user: current } : null, loading: !ready, demo: !backendConfigured };
}

/** Throws Error('invalid_credentials') or the Supabase error. */
export async function signIn(email: string, password: string): Promise<SessionUser> {
  const clean = email.trim().toLowerCase();
  if (backendConfigured) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: clean, password });
    if (error) throw error;
    const user = fromSupabase(data.user);
    if (!user) throw new Error('invalid_credentials');
    emit(user);
    return user;
  }
  const passwordHash = await hash(password);
  const account = readJson<DemoAccount[]>(ACCOUNTS_KEY, []).find((item) => item.email === clean && item.passwordHash === passwordHash);
  if (!account) throw new Error('invalid_credentials');
  const user: SessionUser = { id: account.id, email: account.email, name: account.name };
  writeJson(SESSION_KEY, user);
  emit(user);
  return user;
}

/** Throws Error('account_exists') or the Supabase error. With Supabase email confirmation on, the user may need to confirm first. */
export async function signUp(email: string, password: string, name = ''): Promise<SignUpResult> {
  const clean = email.trim().toLowerCase();
  if (backendConfigured) {
    const { data, error } = await supabase.auth.signUp({ email: clean, password, options: { data: { name }, emailRedirectTo: window.location.origin } });
    if (error) throw error;
    const user = fromSupabase(data.user);
    if (!user) throw new Error('signup_failed');
    if (data.session) emit(user);
    return { ...user, needsConfirmation: !data.session };
  }
  const accounts = readJson<DemoAccount[]>(ACCOUNTS_KEY, []);
  if (accounts.some((item) => item.email === clean)) throw new Error('account_exists');
  const account: DemoAccount = { id: newId(), email: clean, name: name.trim(), passwordHash: await hash(password) };
  writeJson(ACCOUNTS_KEY, [...accounts, account]);
  const user: SessionUser = { id: account.id, email: account.email, name: account.name };
  writeJson(SESSION_KEY, user);
  emit(user);
  return { ...user, needsConfirmation: false };
}

export async function signOut(): Promise<void> {
  if (backendConfigured) await supabase.auth.signOut();
  writeJson(SESSION_KEY, null);
  emit(null);
}

/** Updates the display name of the signed-in user. */
export async function updateName(name: string): Promise<void> {
  if (!current) return;
  const next = { ...current, name: name.trim() };
  if (backendConfigured) {
    const { error } = await supabase.auth.updateUser({ data: { name: next.name } });
    if (error) throw error;
  } else {
    writeJson(ACCOUNTS_KEY, readJson<DemoAccount[]>(ACCOUNTS_KEY, []).map((item) => (item.id === next.id ? { ...item, name: next.name } : item)));
    writeJson(SESSION_KEY, next);
  }
  emit(next);
}
