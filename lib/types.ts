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

export interface Jornada {
  id_jornada: string;
  estado: EstadoJornada;
  tiempo_total_seg: number;
  inicio_ts: string | null;
  costo_total: number;
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
