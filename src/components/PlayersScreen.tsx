'use client';

import { useState, useMemo, useCallback } from 'react';
import { useSession } from '../lib/session';
import {
  usuarioses,
  jornadases,
  asistencia_drafts,
  equipos_jornadas,
  useCollection,
  type Usuario,
  type Asistencia_draft,
  type Equipos_jornada,
  type Jornada,
} from '../lib/data';
import RatingRadar from './RatingRadar';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ChevronDown, Plus, Trash2, Check, X, User } from 'lucide-react';

const POSICIONES = ['POR', 'DEF', 'MC', 'DEL'] as const;
type Posicion = (typeof POSICIONES)[number];

const POSICION_LABELS: Record<Posicion, string> = {
  POR: 'Portero',
  DEF: 'Defensa',
  MC: 'Medio Centro',
  DEL: 'Delantero',
};

const POSICION_COLORS: Record<Posicion, string> = {
  POR: 'bg-blue-900 text-blue-100',
  DEF: 'bg-red-900 text-red-100',
  MC: 'bg-yellow-900 text-yellow-100',
  DEL: 'bg-green-900 text-green-100',
};

interface PlayerRow extends Usuario {
  asistencia?: Asistencia_draft;
  presente?: boolean;
  equipo_id?: string;
  capitanId?: string;
}

export default function PlayersScreen() {
  const { user, loading: sessionLoading, demo } = useSession();
  const [filterAgeMin, setFilterAgeMin] = useState<number | ''>('');
  const [filterAgeMax, setFilterAgeMax] = useState<number | ''>('');
  const [filterPosition, setFilterPosition] = useState<Posicion | ''>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerAge, setNewPlayerAge] = useState<number | ''>('');
  const [newPlayerPosition, setNewPlayerPosition] = useState<Posicion | ''>('');
  const [newPlayerRol, setNewPlayerRol] = useState<string>('jugador_registrado');
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [tempPosition, setTempPosition] = useState<Posicion | ''>('');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({ open: false, title: '', message: '', action: async () => {} });

  // Load users, current jornada, asistencia, equipos, and capitanes
  const { items: usuarios, loading: usuariosLoading, reload: reloadUsuarios } = useCollection(usuarioses);
  const { items: jornadas, loading: jornadasLoading } = useCollection(jornadases);
  const { items: asistencias, loading: asistenciasLoading } = useCollection(asistencia_drafts);
  const { items: equipos } = useCollection(equipos_jornadas);

  const currentJornada: Jornada | undefined = useMemo(() => {
    return jornadas[0];
  }, [jornadas]);

  const jornada_en_curso = currentJornada?.estado === 'en_curso' || currentJornada?.estado === 'en_partidos';
  const draft_iniciado = currentJornada?.draft_estado === 'en_curso' || currentJornada?.draft_estado === 'terminado';

  // Build player rows with their attendance and team status
  const playerRows: PlayerRow[] = useMemo(() => {
    return usuarios.map((usuario) => {
      const asistencia = currentJornada
        ? asistencias.find((a) => a.jornada_id === currentJornada.id && a.usuario_id === usuario.id)
        : undefined;
      const equipo_id = asistencia?.equipo_id;
      const capitanId = equipo_id
        ? equipos.find((e) => e.id === equipo_id)?.capitan_id
        : undefined;

      return {
        ...usuario,
        asistencia,
        presente: asistencia?.presente ?? false,
        equipo_id,
        capitanId,
      };
    });
  }, [usuarios, currentJornada, asistencias, equipos]);

  // Apply filters
  const filteredPlayers = useMemo(() => {
    return playerRows.filter((player) => {
      if (filterAgeMin !== '' && (!player.edad || player.edad < filterAgeMin)) return false;
      if (filterAgeMax !== '' && (!player.edad || player.edad > filterAgeMax)) return false;
      if (filterPosition && player.posicion !== filterPosition) return false;
      return true;
    });
  }, [playerRows, filterAgeMin, filterAgeMax, filterPosition]);

  // Quick add player
  const handleAddPlayer = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newPlayerName.trim()) {
        toast.error('Ingresa el nombre del jugador');
        return;
      }
      if (!user) return;

      try {
        await usuarioses.create({
          user_id: user.id,
          nombre: newPlayerName.trim(),
          edad: newPlayerAge !== '' ? newPlayerAge : undefined,
          posicion: newPlayerPosition || undefined,
          rol_sistema: newPlayerRol,
        });
        toast.success(`${newPlayerName.trim()} agregado`);
        setNewPlayerName('');
        setNewPlayerAge('');
        setNewPlayerPosition('');
        setNewPlayerRol('jugador_registrado');
        setShowAddForm(false);
        reloadUsuarios();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al agregar jugador');
      }
    },
    [newPlayerName, newPlayerAge, newPlayerPosition, newPlayerRol, user, reloadUsuarios]
  );

  // Toggle attendance
  const handleToggleAsistencia = useCallback(
    async (player: PlayerRow) => {
      if (!user || !currentJornada) return;

      try {
        if (player.asistencia) {
          // If they're already on a team (post-draft), prevent unmarking
          if (player.equipo_id && draft_iniciado) {
            toast.error('No se puede desmarcar asistencia a quien ya tiene equipo');
            return;
          }
          await asistencia_drafts.update(player.asistencia.id, {
            presente: !player.presente,
          });
        } else {
          await asistencia_drafts.create({
            user_id: user.id,
            jornada_id: currentJornada.id,
            usuario_id: player.id,
            presente: true,
            pago_realizado: false,
          });
        }
        reloadUsuarios();
        toast.success(player.presente ? 'Asistencia desmarcada' : 'Asistencia marcada');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al marcar asistencia');
      }
    },
    [user, currentJornada, draft_iniciado, reloadUsuarios]
  );

  // Update position
  const handleSavePosition = useCallback(
    async (playerId: string) => {
      if (!tempPosition) {
        setEditingPositionId(null);
        return;
      }

      try {
        await usuarioses.update(playerId, { posicion: tempPosition });
        toast.success('Posición actualizada');
        setEditingPositionId(null);
        setTempPosition('');
        reloadUsuarios();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al actualizar posición');
      }
    },
    [tempPosition, reloadUsuarios]
  );

  // Toggle captain
  const handleToggleCaptain = useCallback(
    async (player: PlayerRow) => {
      if (!user || !currentJornada) return;

      // Can't make someone captain if they're not marked as present
      if (!player.presente) {
        toast.error('Solo puedes elegir capitán entre quienes asisten');
        return;
      }

      try {
        if (player.equipo_id) {
          // They already have a team; can't change
          toast.error('No se pueden cambiar capitanes después de asignar equipos');
        } else {
          // Create a minimal team with this player as captain
          const newTeam = await equipos_jornadas.create({
            user_id: user.id,
            jornada_id: currentJornada.id,
            capitan_id: player.id,
            cupo_max: 6,
            orden_turno: 0,
            orden_cola: 0,
            pago_entregado_admin: false,
          });

          // Assign them to their team
          if (player.asistencia) {
            await asistencia_drafts.update(player.asistencia.id, {
              equipo_id: newTeam.id,
            });
          } else {
            await asistencia_drafts.create({
              user_id: user.id,
              jornada_id: currentJornada.id,
              usuario_id: player.id,
              presente: true,
              equipo_id: newTeam.id,
              pago_realizado: false,
            });
          }

          toast.success(`${player.nombre} es ahora capitán`);
          reloadUsuarios();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al asignar capitán');
      }
    },
    [user, currentJornada, reloadUsuarios]
  );

  // Remove from team
  const handleRemoveFromTeam = useCallback(
    async (player: PlayerRow) => {
      if (!player.asistencia) return;

      try {
        await asistencia_drafts.update(player.asistencia.id, {
          equipo_id: undefined,
        });
        toast.success('Jugador removido del equipo');
        reloadUsuarios();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al remover del equipo');
      }
    },
    [reloadUsuarios]
  );

  // Delete player
  const handleDeletePlayer = useCallback(
    async (player: PlayerRow) => {
      try {
        await usuarioses.remove(player.id);
        toast.success('Jugador eliminado');
        reloadUsuarios();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al eliminar jugador');
      }
    },
    [reloadUsuarios]
  );

  const openDeleteConfirm = (player: PlayerRow) => {
    setConfirmDialog({
      open: true,
      title: 'Eliminar jugador',
      message: `¿Estás seguro de que deseas eliminar a ${player.nombre}? Esta acción no se puede deshacer.`,
      action: async () => handleDeletePlayer(player),
    });
  };

  if (sessionLoading || usuariosLoading || jornadasLoading || asistenciasLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        {Array(3)
          .fill(null)
          .map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-zinc-700 animate-pulse" />
          ))}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted">No autenticado</p>
      </div>
    );
  }

  if (demo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
        <div className="bg-surface border border-border rounded-lg p-6 text-center max-w-md">
          <p className="text-sm text-muted mb-2">Modo demo</p>
          <p className="text-text text-sm">
            Los datos no se guardan. Abre{' '}
            <span className="font-semibold">Connectors → Supabase</span> y conecta el proyecto de esta app para
            guardar datos reales.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface border-b border-border px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-text mb-4">Gestión de Jugadores</h1>

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {/* Age Min */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted uppercase tracking-wide">Edad mín.</label>
              <input
                type="number"
                min={10}
                max={60}
                value={filterAgeMin}
                onChange={(e) => setFilterAgeMin(e.target.value === '' ? '' : parseInt(e.target.value))}
                placeholder="—"
                className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-accent"
              />
            </div>

            {/* Age Max */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted uppercase tracking-wide">Edad máx.</label>
              <input
                type="number"
                min={10}
                max={60}
                value={filterAgeMax}
                onChange={(e) => setFilterAgeMax(e.target.value === '' ? '' : parseInt(e.target.value))}
                placeholder="—"
                className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-accent"
              />
            </div>

            {/* Position */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted uppercase tracking-wide">Posición</label>
              <select
                value={filterPosition}
                onChange={(e) => setFilterPosition((e.target.value as Posicion) || '')}
                className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Todos</option>
                {POSICIONES.map((pos) => (
                  <option key={pos} value={pos}>
                    {POSICION_LABELS[pos]}
                  </option>
                ))}
              </select>
            </div>

            {/* Add Player Button */}
            <div className="flex items-end">
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="w-full px-4 py-2 rounded-lg bg-accent text-tinta font-semibold text-sm hover:bg-yellow-600 active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                <Plus size={18} />
                <span>Agregar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Player Form */}
      {showAddForm && (
        <div className="bg-surface border-b border-border px-4 py-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <h3 className="text-lg font-semibold text-text mb-3">Alta rápida</h3>
            <form onSubmit={handleAddPlayer} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Nombre *</label>
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="p. ej. Juan"
                  className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Edad</label>
                <input
                  type="number"
                  min={10}
                  max={60}
                  value={newPlayerAge}
                  onChange={(e) => setNewPlayerAge(e.target.value === '' ? '' : parseInt(e.target.value))}
                  placeholder="p. ej. 28"
                  className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Posición</label>
                <select
                  value={newPlayerPosition}
                  onChange={(e) => setNewPlayerPosition((e.target.value as Posicion) || '')}
                  className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-accent"
                >
                  <option value="">—</option>
                  {POSICIONES.map((pos) => (
                    <option key={pos} value={pos}>
                      {POSICION_LABELS[pos]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-lg bg-success text-tinta font-semibold text-sm hover:bg-green-600 active:scale-95 transition-transform"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-2 rounded-lg bg-bg border border-border text-text hover:bg-surface"
                >
                  <X size={18} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Players List */}
      <div className="px-4 py-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {filteredPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <User size={40} className="text-muted mb-3 opacity-50" />
              <p className="text-text font-semibold mb-1">No hay jugadores</p>
              <p className="text-sm text-muted mb-4">Agrega el primero con el botón de arriba</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredPlayers.map((player) => (
                <div
                  key={player.id}
                  className="bg-surface border border-border rounded-lg overflow-hidden hover:border-accent/50 transition-colors"
                >
                  {/* Main Row */}
                  <div
                    className="px-4 py-3 cursor-pointer flex items-center justify-between"
                    onClick={() =>
                      setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)
                    }
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-text">{player.nombre}</h3>
                        {player.capitanId && (
                          <span className="text-xs px-2 py-1 rounded bg-accent text-tinta font-semibold">
                            Capitán
                          </span>
                        )}
                        {player.presente && currentJornada && (
                          <span className="text-xs px-2 py-1 rounded bg-success text-tinta font-semibold">
                            Presente
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 items-center text-sm text-muted">
                        {player.edad && <span>{player.edad} años</span>}
                        {player.posicion && (
                          <span className={clsx('px-2 py-1 rounded text-xs font-semibold', POSICION_COLORS[player.posicion as Posicion])}>
                            {POSICION_LABELS[player.posicion as Posicion]}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-muted">
                      <ChevronDown
                        size={20}
                        className={clsx('transition-transform', {
                          'rotate-180': expandedPlayerId === player.id,
                        })}
                      />
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedPlayerId === player.id && (
                    <div className="border-t border-border bg-bg px-4 py-3 flex flex-col gap-4">
                      {/* Attendance Toggle */}
                      {currentJornada && !jornada_en_curso && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-text">Asistencia</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleAsistencia(player);
                            }}
                            className={clsx(
                              'px-3 py-2 rounded-lg font-semibold text-sm transition-colors active:scale-95',
                              player.presente
                                ? 'bg-success text-tinta hover:bg-green-600'
                                : 'bg-bg border border-border text-text hover:bg-surface'
                            )}
                          >
                            {player.presente ? (
                              <span className="flex items-center gap-1">
                                <Check size={16} /> Sí
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <X size={16} /> No
                              </span>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Position Edit */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text">Posición</span>
                        {editingPositionId === player.id ? (
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={tempPosition}
                              onChange={(e) => setTempPosition((e.target.value as Posicion) || '')}
                              className="px-2 py-1 rounded-lg bg-bg border border-border text-text text-sm"
                              autoFocus
                            >
                              <option value="">—</option>
                              {POSICIONES.map((pos) => (
                                <option key={pos} value={pos}>
                                  {POSICION_LABELS[pos]}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSavePosition(player.id);
                              }}
                              className="px-3 py-1 rounded-lg bg-success text-tinta font-semibold text-sm hover:bg-green-600"
                            >
                              OK
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPositionId(player.id);
                              setTempPosition((player.posicion as Posicion) || '');
                            }}
                            className="text-sm px-3 py-1 rounded-lg bg-bg border border-border text-text hover:bg-surface"
                          >
                            {player.posicion
                              ? POSICION_LABELS[player.posicion as Posicion]
                              : 'Asignar'}
                          </button>
                        )}
                      </div>

                      {/* Captain Toggle */}
                      {currentJornada && !draft_iniciado && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-text">Capitán</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleCaptain(player);
                            }}
                            className={clsx(
                              'px-3 py-2 rounded-lg font-semibold text-sm transition-colors active:scale-95',
                              player.capitanId
                                ? 'bg-accent text-tinta hover:bg-yellow-600'
                                : 'bg-bg border border-border text-text hover:bg-surface'
                            )}
                            disabled={!player.presente && !player.capitanId}
                          >
                            {player.capitanId ? '✓ Sí' : 'Designar'}
                          </button>
                        </div>
                      )}

                      {/* Team Assignment */}
                      {player.equipo_id && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-text">Equipo asignado</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromTeam(player);
                            }}
                            className="px-3 py-2 rounded-lg bg-error text-tinta font-semibold text-sm hover:bg-red-700 active:scale-95 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      )}

                      {/* Rating */}
                      <div className="border-t border-border pt-3">
                        <p className="text-xs font-medium text-muted uppercase mb-2">Valoración</p>
                        <RatingRadar playerId={player.id} />
                      </div>

                      {/* Delete */}
                      <div className="border-t border-border pt-3 flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteConfirm(player);
                          }}
                          className="px-3 py-2 rounded-lg bg-error/10 text-error hover:bg-error/20 active:scale-95 transition-colors flex items-center gap-2 text-sm font-semibold"
                        >
                          <Trash2 size={16} />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmActionDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous={true}
        onConfirm={async () => {
          await confirmDialog.action();
          setConfirmDialog({ ...confirmDialog, open: false });
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, open: false })}
      />
    </div>
  );
}
