export type RolSistema = "super_admin" | "admin" | "capitan" | "jugador_registrado";

export interface Usuario {
  id_usuario: string;
  nombre: string;
  edad: number | null;
  rol_sistema: RolSistema;
  pin_hash: string | null;
}

export interface SesionUsuario {
  id_usuario: string;
  nombre: string;
  rol_sistema: RolSistema;
}

export type EstadoJornada = "pendiente" | "en_curso" | "finalizada";
export type EstadoDraft = "no_iniciado" | "en_curso" | "finalizado";

export interface Jornada {
  id_jornada: string;
  estado: EstadoJornada;
  tiempo_total_seg: number;
  inicio_ts: string | null;
  costo_total: number;
  draft_estado: EstadoDraft;
  draft_turno_equipo_id: string | null;
  permitir_cambios_post_draft: boolean;
}

export interface EquipoJornada {
  id_equipo: string;
  id_jornada: string;
  id_capitan: string | null;
  color_nombre: string | null;
  cuota_equipo: number;
  cupo_max: number | null;
  orden_turno: number | null;
  orden_cola: number | null;
}

export type EstadoPartido = "pendiente" | "en_curso" | "finalizado";

export interface MiniPartido {
  id_partido: string;
  id_jornada: string;
  id_equipo_a: string | null;
  id_equipo_b: string | null;
  estado: EstadoPartido;
  marcador_a: number;
  marcador_b: number;
  inicio_ts: string | null;
  duracion_seg: number;
}

export interface EventoPartido {
  id_evento: string;
  id_partido: string;
  accion: "gol" | "falta";
  id_jugador: string | null;
  creado_en: string;
}

export interface AsistenciaDraft {
  id_asistencia: string;
  id_jornada: string;
  id_usuario: string;
  id_equipo: string | null;
  presente: boolean;
  pago_realizado: boolean;
}

export const ROLES_CON_PIN: RolSistema[] = ["super_admin", "admin", "capitan"];

export function requierePin(rol: RolSistema) {
  return ROLES_CON_PIN.includes(rol);
}
