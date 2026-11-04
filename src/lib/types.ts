// Tipos de los datos de la app, generados por Cosmos a partir del plan.
export interface Row {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Usuarios {
  id: string;
  user_id: string;
  nombre: string;
  edad?: number | null;
  rol_sistema: string;
  posicion?: string | null;
  pin_hash?: string | null;
  created_at: string;
  updated_at: string;
}
export type UsuariosInput = Omit<Usuarios, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface Jornadas {
  id: string;
  user_id: string;
  estado: string;
  tiempo_total_seg: number;
  inicio_ts?: string | null;
  costo_total?: number | null;
  draft_estado: string;
  draft_turno_equipo_id?: string | null;
  permitir_cambios_post_draft: boolean;
  duracion_mini_partido_seg: number;
  creado_por: string;
  created_at: string;
  updated_at: string;
}
export type JornadasInput = Omit<Jornadas, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface Equipos_jornada {
  id: string;
  user_id: string;
  jornada_id: string;
  capitan_id: string;
  cuota_equipo?: number | null;
  cupo_max: number;
  orden_turno: number;
  orden_cola: number;
  pago_entregado_admin: boolean;
  created_at: string;
  updated_at: string;
}
export type Equipos_jornadaInput = Omit<Equipos_jornada, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface Asistencia_draft {
  id: string;
  user_id: string;
  jornada_id: string;
  usuario_id: string;
  equipo_id?: string | null;
  presente: boolean;
  pago_realizado: boolean;
  created_at: string;
  updated_at: string;
}
export type Asistencia_draftInput = Omit<Asistencia_draft, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface Mini_partidos {
  id: string;
  user_id: string;
  jornada_id: string;
  equipo_a_id: string;
  equipo_b_id: string;
  estado: string;
  marcador_a: number;
  marcador_b: number;
  inicio_ts?: string | null;
  duracion_seg: number;
  created_at: string;
  updated_at: string;
}
export type Mini_partidosInput = Omit<Mini_partidos, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface Eventos_partido {
  id: string;
  user_id: string;
  partido_id: string;
  accion: string;
  jugador_id?: string | null;
  creado_en: string;
  created_at: string;
  updated_at: string;
}
export type Eventos_partidoInput = Omit<Eventos_partido, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface Valoraciones {
  id: string;
  user_id: string;
  evaluado_id: string;
  evaluador_id: string;
  stats: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
export type ValoracionesInput = Omit<Valoraciones, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
