import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import {
  usuarioses,
  jornadases,
  equipos_jornadas,
  asistencia_drafts,
  useCollection,
} from '../lib/data';
import { toast } from 'sonner';
import { ChevronDown, Plus, Trash2, Users, AlertCircle } from 'lucide-react';
import RatingRadar from './RatingRadar';
import { cn } from '../lib/cn';

interface DraftPlayer {
  asistencia_id: string;
  usuario_id: string;
  nombre: string;
  edad?: number;
  posicion?: string;
  presente: boolean;
  equipo_id?: string;
  equipo_orden?: number;
}

interface DraftTeam {
  id: string;
  capitan_id: string;
  capitan_nombre: string;
  orden_turno: number;
  cupo_max: number;
  jugadores: DraftPlayer[];
  stats?: {
    edad_promedio?: number;
    valor_promedio?: number;
  };
}

export default function DraftScreen() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [jornada, setJornada] = useState<any>(null);
  const [equipos, setEquipos] = useState<DraftTeam[]>([]);
  const [jugadoresDisponibles, setJugadoresDisponibles] = useState<DraftPlayer[]>([]);
  const [capitalActual, setCapitalActual] = useState<DraftTeam | null>(null);
  const [cargando, setCargando] = useState(true);
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const [radarUsuarioId, setRadarUsuarioId] = useState<string | null>(null);
  const [permitirCambios, setPermitirCambios] = useState(false);

  const jornadaData = useCollection(jornadases, {
    match: { estado: 'draft' },
    pageSize: 1,
  });

  const equiposData = useCollection(equipos_jornadas, {
    pageSize: 100,
  });

  const asistenciaData = useCollection(asistencia_drafts, {
    pageSize: 200,
  });

  const usuariosData = useCollection(usuarioses, {
    pageSize: 200,
  });

  useEffect(() => {
    if (
      jornadaData.loading ||
      equiposData.loading ||
      asistenciaData.loading ||
      usuariosData.loading
    ) {
      return;
    }

    setCargando(true);

    if (!jornadaData.items.length) {
      setCargando(false);
      return;
    }

    const currentJornada = jornadaData.items[0];
    setJornada(currentJornada);
    setPermitirCambios(currentJornada.permitir_cambios_post_draft ?? false);

    // Mapeo de usuarios por ID
    const usuariosMap = new Map(
      usuariosData.items.map((u: any) => [u.id, u])
    );

    // Construir equipos con sus jugadores
    const equiposConstruidos: DraftTeam[] = (
      equiposData.items.filter((e: any) => e.jornada_id === currentJornada.id)
    )
      .map((eq: any) => {
        const capitan = usuariosMap.get(eq.capitan_id);
        const jugadoresEquipo = asistenciaData.items.filter(
          (a: any) => a.equipo_id === eq.id
        );

        const mapped: DraftTeam = {
          id: eq.id,
          capitan_id: eq.capitan_id,
          capitan_nombre: capitan?.nombre ?? '(sin nombre)',
          orden_turno: eq.orden_turno,
          cupo_max: eq.cupo_max,
          jugadores: jugadoresEquipo.map((a: any) => {
            const usuario = usuariosMap.get(a.usuario_id);
            return {
              asistencia_id: a.id,
              usuario_id: a.usuario_id,
              nombre: usuario?.nombre ?? '(sin nombre)',
              edad: usuario?.edad,
              posicion: usuario?.posicion,
              presente: a.presente,
              equipo_id: a.equipo_id,
            };
          }),
        };

        // Calcular estadísticas del equipo
        if (mapped.jugadores.length > 0) {
          const edades = mapped.jugadores
            .map((j) => j.edad)
            .filter((e) => e !== undefined) as number[];
          if (edades.length > 0) {
            mapped.stats = {
              edad_promedio: edades.reduce((a, b) => a + b, 0) / edades.length,
            };
          }
        }

        return mapped;
      })
      .sort((a, b) => a.orden_turno - b.orden_turno);

    setEquipos(equiposConstruidos);

    // Jugadores disponibles (con asistencia, sin equipo)
    const disponibles = asistenciaData.items
      .filter((a: any) => a.jornada_id === currentJornada.id && a.presente && !a.equipo_id)
      .map((a: any) => {
        const usuario = usuariosMap.get(a.usuario_id);
        return {
          asistencia_id: a.id,
          usuario_id: a.usuario_id,
          nombre: usuario?.nombre ?? '(sin nombre)',
          edad: usuario?.edad,
          posicion: usuario?.posicion,
          presente: true,
          equipo_id: undefined,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    setJugadoresDisponibles(disponibles);

    // Determinar capitán en turno
    if (equiposConstruidos.length > 0) {
      const turnosOrdenados = equiposConstruidos.sort(
        (a, b) => a.orden_turno - b.orden_turno
      );
      const proximoTurno = turnosOrdenados.find(
        (e) => e.jugadores.length < e.cupo_max
      );
      if (proximoTurno) {
        setCapitalActual(proximoTurno);
        // Auto-expandir el equipo en turno
        setExpandidos((prev) => ({
          ...prev,
          [proximoTurno.id]: true,
        }));
      }
    }

    setCargando(false);
  }, [
    jornadaData.items,
    equiposData.items,
    asistenciaData.items,
    usuariosData.items,
  ]);

  // Verificar si el usuario actual puede elegir
  const puedeElegir = useMemo(() => {
    if (!user || !capitalActual) return false;
    const esCapitan = capitalActual.capitan_id === user.id;
    const esSuperAdmin = user.rol === 'super_admin';
    return esCapitan || esSuperAdmin;
  }, [user, capitalActual]);

  // Seleccionar jugador
  const seleccionarJugador = async (asistenciaId: string, usuarioId: string) => {
    if (!puedeElegir || !capitalActual) {
      toast.error('No tienes permiso para elegir en este turno.');
      return;
    }

    try {
      const input = {
        equipo_id: capitalActual.id,
      };
      await asistencia_drafts.update(asistenciaId, input);
      toast.success(`${jugadoresDisponibles.find((j) => j.usuario_id === usuarioId)?.nombre ?? 'Jugador'} asignado a ${capitalActual.capitan_nombre}`);
      asistenciaData.reload();
    } catch (err) {
      toast.error(
        `Error al asignar jugador: ${err instanceof Error ? err.message : 'intenta nuevamente'}`
      );
    }
  };

  // Remover jugador del equipo
  const removerJugador = async (asistenciaId: string, nombreJugador: string, equipoId: string) => {
    if (!puedeElegir) {
      toast.error('No tienes permiso para remover jugadores.');
      return;
    }

    try {
      const input = { equipo_id: null };
      await asistencia_drafts.update(asistenciaId, input);
      toast.success(`${nombreJugador} removido del equipo`);
      asistenciaData.reload();
    } catch (err) {
      toast.error(
        `Error al remover jugador: ${err instanceof Error ? err.message : 'intenta nuevamente'}`
      );
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-[#08120F] text-[#F3F7F3] p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="h-12 bg-[#18352A]/50 rounded-lg animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-[#18352A]/50 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!jornada) {
    return (
      <div className="min-h-screen bg-[#08120F] text-[#F3F7F3] p-4 md:p-6">
        <div className="max-w-2xl mx-auto text-center py-12">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-[#F4B942]" />
          <h2 className="text-xl font-semibold mb-2">No hay jornada en draft</h2>
          <p className="text-[#B7C8BD] mb-6">
            Crea una jornada nueva en el Dashboard para comenzar el draft.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-[#F4B942] text-[#172014] font-semibold rounded-lg hover:bg-[#f5c557] active:scale-95 transition-all"
          >
            Ir al Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Draft terminado: todos los equipos llenos
  const draftTerminado =
    equipos.length > 0 &&
    equipos.every((e) => e.jugadores.length >= e.cupo_max);

  return (
    <div className="min-h-screen bg-[#08120F] text-[#F3F7F3] pb-32">
      {/* Header */}
      <div className="bg-[#10231D] border-b border-[#2B4A3B] px-4 md:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold font-['Space_Grotesk'] mb-2">
            Draft de Equipos
          </h1>
          <p className="text-[#B7C8BD] text-sm md:text-base">
            {draftTerminado
              ? '✓ Draft completado'
              : capitalActual
                ? `Turno: ${capitalActual.capitan_nombre}`
                : 'Cargando...'}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Estado del Draft */}
        {!draftTerminado && (
          <div className="bg-[#18352A]/60 border border-[#2B4A3B] rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <Users className="w-5 h-5 text-[#F4B942]" />
              <span className="font-semibold">Jugadores disponibles:</span>
            </div>
            <p className="text-2xl font-bold text-[#F4B942]">
              {jugadoresDisponibles.length}
            </p>
            {!puedeElegir && capitalActual && (
              <p className="text-xs text-[#B7C8BD] mt-3">
                👤 Esperando a {capitalActual.capitan_nombre}...
              </p>
            )}
          </div>
        )}

        {/* Tablero de Equipos (Fichas Magnéticas) */}
        <div className="space-y-4">
          {equipos.map((equipo) => {
            const esEnTurno = capitalActual?.id === equipo.id;
            const lleno = equipo.jugadores.length >= equipo.cupo_max;
            const expandido = expandidos[equipo.id] ?? false;

            return (
              <div
                key={equipo.id}
                className={cn(
                  'border-2 rounded-lg overflow-hidden transition-all',
                  esEnTurno && !lleno
                    ? 'border-[#F4B942] bg-[#18352A]'
                    : 'border-[#2B4A3B] bg-[#10231D]'
                )}
              >
                {/* Header del Equipo */}
                <button
                  onClick={() =>
                    setExpandidos((prev) => ({
                      ...prev,
                      [equipo.id]: !prev[equipo.id],
                    }))
                  }
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-[#18352A]/50 transition-colors"
                >
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold text-[#F4B942]">
                        {equipo.capitan_nombre}
                      </span>
                      {esEnTurno && !lleno && (
                        <span className="px-2 py-1 bg-[#F4B942] text-[#172014] text-xs font-semibold rounded">
                          EN TURNO
                        </span>
                      )}
                    </div>
                    <p className="text-[#B7C8BD] text-sm">
                      {equipo.jugadores.length}/{equipo.cupo_max} jugadores
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'w-5 h-5 text-[#B7C8BD] transition-transform',
                      expandido && 'rotate-180'
                    )}
                  />
                </button>

                {/* Contenido Expandido */}
                {expandido && (
                  <div className="border-t border-[#2B4A3B] px-4 py-4 space-y-3">
                    {/* Lista de Jugadores del Equipo */}
                    {equipo.jugadores.length > 0 ? (
                      <div className="space-y-2">
                        {equipo.jugadores.map((jug) => (
                          <div
                            key={jug.asistencia_id}
                            className="flex items-center justify-between bg-[#18352A] rounded-lg p-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{jug.nombre}</p>
                              {jug.edad && (
                                <p className="text-xs text-[#B7C8BD]">
                                  {jug.edad} años
                                  {jug.posicion && ` • ${jug.posicion}`}
                                </p>
                              )}
                            </div>
                            {puedeElegir && esEnTurno && (
                              <button
                                onClick={() =>
                                  removerJugador(
                                    jug.asistencia_id,
                                    jug.nombre,
                                    equipo.id
                                  )
                                }
                                className="ml-3 p-2 text-[#E86161] hover:bg-[#E86161]/20 rounded transition-colors"
                                title="Remover jugador"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[#B7C8BD] text-sm italic">
                        Sin jugadores aún
                      </p>
                    )}

                    {/* Promedio de Edad (si aplica) */}
                    {equipo.stats?.edad_promedio && (
                      <div className="text-xs text-[#B7C8BD] border-t border-[#2B4A3B] pt-2">
                        ⌀ Edad: {equipo.stats.edad_promedio.toFixed(1)} años
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bolsa de Disponibles */}
        {!draftTerminado && jugadoresDisponibles.length > 0 && (
          <div className="bg-[#10231D] border border-[#2B4A3B] rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-[#18352A] border-b border-[#2B4A3B]">
              <h3 className="font-semibold flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-[#F4B942] text-[#172014] text-xs font-bold">
                  {jugadoresDisponibles.length}
                </span>
                Bolsa de Disponibles
              </h3>
            </div>

            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {jugadoresDisponibles.map((jug) => (
                <div
                  key={jug.asistencia_id}
                  className="flex items-center justify-between bg-[#18352A] rounded-lg p-3 hover:bg-[#18352A]/80 transition-colors"
                >
                  <button
                    onClick={() => setRadarUsuarioId(jug.usuario_id)}
                    className="flex-1 text-left min-w-0 hover:text-[#F4B942] transition-colors"
                  >
                    <p className="font-medium truncate">{jug.nombre}</p>
                    {jug.edad && (
                      <p className="text-xs text-[#B7C8BD]">
                        {jug.edad} años
                        {jug.posicion && ` • ${jug.posicion}`}
                      </p>
                    )}
                  </button>

                  {puedeElegir && capitalActual && (
                    <button
                      onClick={() =>
                        seleccionarJugador(jug.asistencia_id, jug.usuario_id)
                      }
                      disabled={capitalActual.jugadores.length >= capitalActual.cupo_max}
                      className={cn(
                        'ml-3 p-2 rounded transition-colors',
                        capitalActual.jugadores.length >= capitalActual.cupo_max
                          ? 'text-[#B7C8BD] cursor-not-allowed'
                          : 'text-[#43C47A] hover:bg-[#43C47A]/20 active:scale-95'
                      )}
                      title={
                        capitalActual.jugadores.length >= capitalActual.cupo_max
                          ? 'Equipo lleno'
                          : 'Seleccionar'
                      }
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estado Final */}
        {draftTerminado && (
          <div className="bg-[#18352A] border border-[#43C47A] rounded-lg p-6 text-center">
            <h3 className="text-lg font-bold text-[#43C47A] mb-2">
              ✓ Draft Completado
            </h3>
            <p className="text-[#B7C8BD] mb-4">
              Todos los equipos están listos. Inicia la jornada desde el Dashboard
              para comenzar los partidos.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-[#43C47A] text-[#08120F] font-semibold rounded-lg hover:bg-[#52d98e] active:scale-95 transition-all"
            >
              Ir al Dashboard
            </button>
          </div>
        )}

        {/* Estado Vacío */}
        {equipos.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-[#F4B942]" />
            <h3 className="text-lg font-semibold mb-2">Sin equipos creados</h3>
            <p className="text-[#B7C8BD] mb-4">
              Crea los equipos y capitanes desde el Dashboard antes de hacer el draft.
            </p>
          </div>
        )}
      </div>

      {/* Modal de Radar (Valoración) */}
      {radarUsuarioId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center"
          onClick={() => setRadarUsuarioId(null)}
        >
          <div
            className="bg-[#10231D] rounded-t-2xl md:rounded-2xl w-full md:w-auto md:max-w-md p-6 max-h-96 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <RatingRadar usuarioId={radarUsuarioId} />
            <button
              onClick={() => setRadarUsuarioId(null)}
              className="w-full mt-4 px-4 py-2 bg-[#2B4A3B] text-[#F3F7F3] font-semibold rounded-lg hover:bg-[#2B4A3B]/80 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
