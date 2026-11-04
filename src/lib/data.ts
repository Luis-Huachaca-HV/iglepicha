// Datos de la app: un único lugar para leer y guardar. Supabase cuando hay un proyecto conectado; si no, demo local en este navegador.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { backendConfigured } from './backend';
import { getSessionUser } from './session';
import type { Row, Usuarios, UsuariosInput, Jornadas, JornadasInput, Equipos_jornada, Equipos_jornadaInput, Asistencia_draft, Asistencia_draftInput, Mini_partidos, Mini_partidosInput, Eventos_partido, Eventos_partidoInput, Valoraciones, ValoracionesInput } from './types';

const STORAGE_KEY = 'gestion-de-pichangas-9e3639:data:v1';
const listeners = new Map<string, Set<() => void>>();

/** Rows of one page of list() and useCollection(). */
export const PAGE_SIZE = 200;
/** The most rows one call returns (and useCollection keeps). */
const MAX_PAGE = 1000;

export interface ListOptions<T extends Row> {
  /** Rows of this page (PAGE_SIZE by default, at most 1000). */
  limit?: number;
  /** The last row of the previous page: this page starts right after it. */
  after?: Pick<T, 'id' | 'created_at'>;
  /** Only the rows whose columns equal these values. */
  match?: Partial<Record<keyof T & string, string | number | boolean | null>>;
}

export interface Collection<T extends Row, I extends object> {
  table: string;
  /** ONE page, newest first (created_at, then id): never the whole table. */
  list(options?: ListOptions<T>): Promise<T[]>;
  /** How many rows there are (with match, how many match), without loading them. */
  count(match?: ListOptions<T>['match']): Promise<number>;
  get(id: string): Promise<T | null>;
  create(input: I): Promise<T>;
  update(id: string, patch: Partial<I>): Promise<T>;
  remove(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

function readAll(): Record<string, Row[]> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Row[]>) : {};
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, Row[]>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    throw new Error('storage_unavailable');
  }
}

function notify(table: string): void {
  listeners.get(table)?.forEach((listener) => listener());
}

function pageSize(limit: number | undefined): number {
  return Math.min(MAX_PAGE, Math.max(1, Math.floor(limit ?? PAGE_SIZE)));
}

/** Newest first; the id breaks ties, so consecutive pages never skip or repeat a row. */
function newestFirst(a: Pick<Row, 'id' | 'created_at'>, b: Pick<Row, 'id' | 'created_at'>): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** A field that was never set counts as null, as a NULL column does on Supabase. */
function rowMatches(row: Row, match: Record<string, unknown> | undefined): boolean {
  return !match || Object.entries(match).every(([key, value]) => value === undefined || ((row as unknown as Record<string, unknown>)[key] ?? null) === value);
}

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ownerId(): string {
  const user = getSessionUser();
  if (user) return user.id;
  if (backendConfigured) throw new Error('not_signed_in');
  return 'local';
}

function collection<T extends Row, I extends object>(table: string): Collection<T, I> {
  const subscribe = (listener: () => void) => {
    const set = listeners.get(table) ?? new Set<() => void>();
    set.add(listener);
    listeners.set(table, set);
    return () => {
      set.delete(listener);
    };
  };
  if (backendConfigured) {
    return {
      table,
      subscribe,
      async list(options = {}) {
        let query = supabase.from(table).select('*');
        // null means "no value": is.null, never eq.null (which matches nothing).
        for (const [key, value] of Object.entries(options.match ?? {})) {
          if (value === undefined) continue;
          query = value === null ? query.is(key, null) : query.eq(key, value);
        }
        if (options.after) {
          const at = JSON.stringify(options.after.created_at);
          query = query.or('created_at.lt.' + at + ',and(created_at.eq.' + at + ',id.lt.' + JSON.stringify(options.after.id) + ')');
        }
        const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize(options.limit));
        if (error) throw error;
        return (data ?? []) as T[];
      },
      async count(match) {
        let query = supabase.from(table).select('*', { count: 'exact', head: true });
        for (const [key, value] of Object.entries(match ?? {})) {
          if (value === undefined) continue;
          query = value === null ? query.is(key, null) : query.eq(key, value);
        }
        const { count: total, error } = await query;
        if (error) throw error;
        return total ?? 0;
      },
      async get(id) {
        const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return (data ?? null) as T | null;
      },
      async create(input) {
        const { data, error } = await supabase.from(table).insert({ ...input, user_id: ownerId() }).select('*').single();
        if (error) throw error;
        notify(table);
        return data as T;
      },
      async update(id, patch) {
        const { data, error } = await supabase.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
        if (error) throw error;
        notify(table);
        return data as T;
      },
      async remove(id) {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        notify(table);
      },
    };
  }
  const rows = () => (readAll()[table] ?? []).filter((row) => row.user_id === ownerId()) as unknown as T[];
  return {
    table,
    subscribe,
    async list(options = {}) {
      const after = options.after;
      return rows()
        .filter((row) => rowMatches(row, options.match) && (!after || newestFirst(row, after) > 0))
        .sort(newestFirst)
        .slice(0, pageSize(options.limit));
    },
    async count(match) {
      return rows().filter((row) => rowMatches(row, match)).length;
    },
    async get(id) {
      return rows().find((row) => row.id === id) ?? null;
    },
    async create(input) {
      const now = new Date().toISOString();
      const row = { ...input, id: newId(), user_id: ownerId(), created_at: now, updated_at: now } as unknown as T;
      const all = readAll();
      writeAll({ ...all, [table]: [...(all[table] ?? []), row] });
      notify(table);
      return row;
    },
    async update(id, patch) {
      const all = readAll();
      const list = all[table] ?? [];
      const index = list.findIndex((row) => row.id === id && row.user_id === ownerId());
      if (index < 0) throw new Error('not_found');
      const row = { ...list[index], ...patch, id, updated_at: new Date().toISOString() } as unknown as T;
      writeAll({ ...all, [table]: list.map((item, i) => (i === index ? row : item)) });
      notify(table);
      return row;
    },
    async remove(id) {
      const all = readAll();
      writeAll({ ...all, [table]: (all[table] ?? []).filter((row) => !(row.id === id && row.user_id === ownerId())) });
      notify(table);
    },
  };
}

/**
 * The newest rows of a collection (one page; loadMore adds the next, up to 1000) and how many there are in all, kept current after any
 * change made anywhere in the app.
 */
export function useCollection<T extends Row, I extends object>(
  source: Collection<T, I>,
  options: { pageSize?: number; match?: ListOptions<T>['match'] } = {},
): { items: T[]; total: number; loading: boolean; error: string | null; hasMore: boolean; loadMore: () => void; reload: () => void } {
  const size = pageSize(options.pageSize);
  const matchKey = JSON.stringify(options.match ?? null);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [shown, setShown] = useState(size);
  useEffect(() => source.subscribe(() => setVersion((value) => value + 1)), [source]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const match = JSON.parse(matchKey) as ListOptions<T>['match'] | null;
    Promise.all([source.list({ limit: shown, match: match ?? undefined }), source.count(match ?? undefined)]).then(
      ([rows, count]) => {
        if (!active) return;
        setItems(rows);
        setTotal(count);
        setError(null);
        setLoading(false);
      },
      (reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [source, version, shown, matchKey]);
  return {
    items,
    total,
    loading,
    error,
    hasMore: items.length < total && shown < MAX_PAGE,
    loadMore: () => setShown((value) => Math.min(MAX_PAGE, value + size)),
    reload: () => setVersion((value) => value + 1),
  };
}

export const usuarioses = collection<Usuarios, UsuariosInput>('gestion_de_9e3639_usuarios');
export const jornadases = collection<Jornadas, JornadasInput>('gestion_de_9e3639_jornadas');
export const equipos_jornadas = collection<Equipos_jornada, Equipos_jornadaInput>('gestion_de_9e3639_equipos_jornada');
export const asistencia_drafts = collection<Asistencia_draft, Asistencia_draftInput>('gestion_de_9e3639_asistencia_draft');
export const mini_partidoses = collection<Mini_partidos, Mini_partidosInput>('gestion_de_9e3639_mini_partidos');
export const eventos_partidos = collection<Eventos_partido, Eventos_partidoInput>('gestion_de_9e3639_eventos_partido');
export const valoracioneses = collection<Valoraciones, ValoracionesInput>('gestion_de_9e3639_valoraciones');
