'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { mini_partidoses, eventos_partidos, jornadases, useCollection } from '../lib/data';
import { useSession } from '../lib/session';
import clsx from 'clsx';
import { AlertCircle, Play, Pause, RotateCcw, Plus, Minus, Clock, Volume2, History } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmActionDialog } from './ConfirmActionDialog';

interface Match {
  id: string;
  jornada_id: string;
  equipo_a_id: string;
  equipo_b_id: string;
  estado: string;
  marcador_a: number;
  marcador_b: number;
  inicio_ts?: string;
  duracion_seg: number;
}

interface Event {
  id: string;
  partido_id: string;
  accion: string;
  jugador_id?: string;
  creado_en: string;
}

interface Jornada {
  id: string;
  estado: string;
  tiempo_total_seg: number;
  inicio_ts?: string;
  duracion_mini_partido_seg: number;
}

// Whistle sound generator (Web Audio API)
const playWhistle = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // Create oscillators for whistle sound (bright, piercing tone)
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);
    
    osc1.frequency.setValueAtTime(1200, now);
    osc2.frequency.setValueAtTime(1500, now);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
  } catch (err) {
    console.error('Whistle error:', err);
  }
};

// Timer component for individual match
const MatchTimer = ({ 
  match, 
  onEnd, 
  jornada 
}: { 
  match: Match; 
  onEnd: () => void;
  jornada?: Jornada;
}) => {
  const [elapsed, setElapsed] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();

  const duration = match.duracion_seg || 600; // default 10 minutes

  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setElapsed(prev => {
          const next = prev + 1;
          if (next >= duration) {
            setIsActive(false);
            playWhistle();
            onEnd();
            return duration;
          }
          return next;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, duration, onEnd]);

  const remaining = duration - elapsed;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4 text-text-secondary" />
      <span className="font-mono text-base font-600 text-text">
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
      <button
        onClick={() => setIsActive(!isActive)}
        className={clsx(
          'px-2 py-1 rounded-lg text-xs font-600 transition-colors',
          isActive
            ? 'bg-surface-elevated text-text hover:bg-surface-elevated/80'
            : 'bg-accent text-accent-tint hover:bg-accent/90'
        )}
        aria-label={isActive ? 'Pausar' : 'Iniciar'}
      >
        {isActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </button>
      <button
        onClick={() => {
          setElapsed(0);
          setIsActive(false);
          playWhistle();
        }}
        className="px-2 py-1 rounded-lg text-xs font-600 bg-surface-elevated text-text hover:bg-surface-elevated/80 transition-colors"
        aria-label="Reiniciar"
      >
        <RotateCcw className="w-3 h-3" />
      </button>
    </div>
  );
};

// Scoreboard for a match
const ScoreboardCard = ({
  match,
  events,
  onAddEvent,
  onRemoveEvent,
  onReset,
  onEnd,
  jornada,
  teamNames,
}: {
  match: Match;
  events: Event[];
  onAddEvent: (matchId: string, action: string, jugadorId?: string) => Promise<void>;
  onRemoveEvent: (eventId: string) => Promise<void>;
  onReset: (matchId: string) => Promise<void>;
  onEnd: () => void;
  jornada?: Jornada;
  teamNames: Record<string, string>;
}) => {
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const handleGoal = async (team: 'a' | 'b') => {
    setLoading(true);
    try {
      await onAddEvent(match.id, team === 'a' ? 'gol_a' : 'gol_b');
    } catch (err) {
      toast.error('Error al registrar gol');
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async (eventId: string) => {
    try {
      await onRemoveEvent(eventId);
    } catch (err) {
      toast.error('Error al deshacer evento');
    }
  };

  const handleResetMatch = async () => {
    setLoading(true);
    try {
      await onReset(match.id);
      setShowReset(false);
      toast.success('Partido reiniciado para pruebas');
    } catch (err) {
      toast.error('Error al reiniciar partido');
    } finally {
      setLoading(false);
    }
  };

  const recentEvent = events.sort(
    (a, b) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime()
  )[0];

  return (
    <div className="bg-surface rounded-2xl p-4 space-y-4">
      {/* Match timer */}
      <div className="flex justify-between items-center">
        <MatchTimer match={match} onEnd={onEnd} jornada={jornada} />
        <button
          onClick={() => playWhistle()}
          className="p-2 rounded-lg bg-accent text-accent-tint hover:bg-accent/90 transition-colors"
          aria-label="Silbato"
          title="Silbato accesible (Web Audio)"
        >
          <Volume2 className="w-4 h-4" />
        </button>
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-xs text-text-secondary font-600 uppercase mb-2">
            {teamNames[match.equipo_a_id] || 'Equipo A'}
          </p>
          <p className="text-5xl font-bold text-accent mb-3">
            {match.marcador_a}
          </p>
          <button
            onClick={() => handleGoal('a')}
            disabled={loading}
            className="w-full py-2 px-2 rounded-lg bg-accent text-accent-tint font-600 text-sm hover:bg-accent/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            aria-label="Gol Equipo A"
          >
            <Plus className="w-4 h-4" />
            Gol
          </button>
        </div>

        <div className="flex items-center justify-center">
          <div className="text-center">
            <p className="text-xs text-text-secondary font-600 uppercase mb-2">vs</p>
            {recentEvent && (
              <button
                onClick={() => handleUndo(recentEvent.id)}
                className="text-xs text-text-secondary hover:text-text transition-colors underline"
                title="Deshacer último evento"
              >
                Deshacer
              </button>
            )}
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-text-secondary font-600 uppercase mb-2">
            {teamNames[match.equipo_b_id] || 'Equipo B'}
          </p>
          <p className="text-5xl font-bold text-accent mb-3">
            {match.marcador_b}
          </p>
          <button
            onClick={() => handleGoal('b')}
            disabled={loading}
            className="w-full py-2 px-2 rounded-lg bg-accent text-accent-tint font-600 text-sm hover:bg-accent/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            aria-label="Gol Equipo B"
          >
            <Plus className="w-4 h-4" />
            Gol
          </button>
        </div>
      </div>

      {/* Event history for this match */}
      {events.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs text-text-secondary font-600 uppercase mb-2">Eventos</p>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {events
              .sort(
                (a, b) =>
                  new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime()
              )
              .slice(0, 5)
              .map(event => (
                <div
                  key={event.id}
                  className="flex justify-between items-center text-xs bg-surface-elevated rounded px-2 py-1"
                >
                  <span className="text-text">
                    {event.accion === 'gol_a'
                      ? `⚽ ${teamNames[match.equipo_a_id]} anota`
                      : `⚽ ${teamNames[match.equipo_b_id]} anota`}
                  </span>
                  <span className="text-text-secondary">
                    {format(parseISO(event.creado_en), 'HH:mm:ss')}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Reset button for testing */}
      <button
        onClick={() => setShowReset(true)}
        className="w-full py-2 px-3 rounded-lg bg-surface-elevated text-text text-sm font-600 hover:bg-surface-elevated/80 transition-colors flex items-center justify-center gap-2"
        aria-label="Reiniciar partido para pruebas"
      >
        <RotateCcw className="w-4 h-4" />
        Reiniciar partido
      </button>

      {showReset && (
        <ConfirmActionDialog
          title="Reiniciar partido"
          message="¿Estás seguro? Se resetearán los marcadores a 0-0."
          onConfirm={handleResetMatch}
          onCancel={() => setShowReset(false)}
          confirmLabel="Reiniciar"
          destructive={false}
          isLoading={loading}
        />
      )}
    </div>
  );
};

// History view
const HistoryTab = ({ matches }: { matches: Match[] }) => {
  const [sortBy, setSortBy] = useState<'date' | 'scoreboard'>('date');

  const sortedMatches = [...matches]
    .filter(m => m.estado === 'finalizado')
    .sort((a, b) => {
      if (sortBy === 'date') {
        return (
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
        );
      }
      return 0;
    });

  return (
    <div className="space-y-3">
      <div className="flex gap-2 justify-center">
        <button
          onClick={() => setSortBy('date')}
          className={clsx(
            'px-3 py-2 rounded-lg text-sm font-600 transition-colors',
            sortBy === 'date'
              ? 'bg-accent text-accent-tint'
              : 'bg-surface text-text hover:bg-surface-elevated'
          )}
        >
          Más recientes
        </button>
      </div>

      {sortedMatches.length === 0 ? (
        <div className="text-center py-8">
          <History className="w-8 h-8 text-text-secondary mx-auto mb-2" />
          <p className="text-text-secondary text-sm">No hay partidos finalizados aún</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedMatches.map(match => (
            <div
              key={match.id}
              className="bg-surface rounded-xl p-3"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-text-secondary font-600">
                  {match.updated_at || match.created_at
                    ? formatDistanceToNow(
                        parseISO(
                          (match.updated_at || match.created_at) as unknown as string
                        ),
                        { addSuffix: true, locale: es }
                      )
                    : 'Hace poco'}
                </span>
                {match.inicio_ts && (
                  <span className="text-xs text-text-secondary">
                    {format(parseISO(match.inicio_ts), 'HH:mm')}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text font-600 flex-1 truncate text-sm">
                  {match.marcador_a} - {match.marcador_b}
                </span>
                <span className="text-text-secondary text-xs">
                  Duración: {Math.floor((match.duracion_seg || 0) / 60)}m
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function MatchesScreen() {
  const { user, loading: sessionLoading, demo } = useSession();
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [activeJornada, setActiveJornada] = useState<Jornada | null>(null);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});

  // Fetch active jornada
  const { items: jornadas, loading: jornadaLoading } = useCollection(jornadases, {
    match: { estado: 'en_curso' },
  });

  // Fetch matches for active jornada
  const jornadaId = jornadas.length > 0 ? jornadas[0].id : null;
  const { items: matches, loading: matchLoading, reload: reloadMatches } = useCollection(
    mini_partidoses,
    {
      match: jornadaId ? { jornada_id: jornadaId } : undefined,
    }
  );

  // Fetch all events for all matches
  const { items: allEvents, reload: reloadEvents } = useCollection(eventos_partidos, {
    match: jornadaId ? { partido_id: jornadaId } : undefined,
  });

  useEffect(() => {
    if (jornadas.length > 0) {
      setActiveJornada(jornadas[0] as unknown as Jornada);
    }
  }, [jornadas]);

  const activeMatch = matches.find(
    m => m.estado === 'en_curso' || m.estado === 'en_cola'
  );

  const handleAddEvent = useCallback(
    async (matchId: string, action: string, jugadorId?: string) => {
      try {
        await eventos_partidos.create({
          partido_id: matchId,
          accion: action,
          jugador_id: jugadorId,
          creado_en: new Date().toISOString(),
        });
        await reloadMatches();
        await reloadEvents();
      } catch (err) {
        throw err;
      }
    },
    [reloadMatches, reloadEvents]
  );

  const handleRemoveEvent = useCallback(
    async (eventId: string) => {
      try {
        await eventos_partidos.remove(eventId);
        await reloadMatches();
        await reloadEvents();
      } catch (err) {
        throw err;
      }
    },
    [reloadMatches, reloadEvents]
  );

  const handleResetMatch = useCallback(
    async (matchId: string) => {
      try {
        await mini_partidoses.update(matchId, {
          marcador_a: 0,
          marcador_b: 0,
          estado: 'en_cola',
        });
        // Delete all events for this match
        const matchEvents = allEvents.filter(e => e.partido_id === matchId);
        for (const event of matchEvents) {
          await eventos_partidos.remove(event.id);
        }
        await reloadMatches();
        await reloadEvents();
      } catch (err) {
        throw err;
      }
    },
    [allEvents, reloadMatches, reloadEvents]
  );

  if (sessionLoading || jornadaLoading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <p className="text-text-secondary">Cargando...</p>
      </div>
    );
  }

  if (demo) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <div className="bg-surface rounded-2xl p-6 max-w-sm text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-error mx-auto" />
          <p className="text-text font-600">Modo demo</p>
          <p className="text-text-secondary text-sm">
            Los datos no se guardan. Abre Connectors → Supabase → conecta tu proyecto.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <p className="text-text-secondary">No autorizado</p>
      </div>
    );
  }

  const activeMatches = matches.filter(m => m.estado === 'en_curso' || m.estado === 'en_cola');
  const finishedMatches = matches.filter(m => m.estado === 'finalizado');

  const getEventsByMatch = (matchId: string) =>
    allEvents.filter(e => e.partido_id === matchId);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-surface-elevated p-4 border-b border-border sticky top-0 z-10">
        <h1 className="text-xl font-bold text-text">Partidos</h1>
        <p className="text-xs text-text-secondary mt-1">
          {activeJornada
            ? activeJornada.estado === 'en_curso'
              ? 'Jornada en curso'
              : 'Jornada pendiente'
            : 'Sin jornada activa'}
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-surface-elevated border-b border-border flex gap-0">
        <button
          onClick={() => setTab('active')}
          className={clsx(
            'flex-1 py-3 px-4 text-sm font-600 border-b-2 transition-colors',
            tab === 'active'
              ? 'text-accent border-accent'
              : 'text-text-secondary border-transparent hover:text-text'
          )}
        >
          Activos {activeMatches.length > 0 && `(${activeMatches.length})`}
        </button>
        <button
          onClick={() => setTab('history')}
          className={clsx(
            'flex-1 py-3 px-4 text-sm font-600 border-b-2 transition-colors',
            tab === 'history'
              ? 'text-accent border-accent'
              : 'text-text-secondary border-transparent hover:text-text'
          )}
        >
          Historial {finishedMatches.length > 0 && `(${finishedMatches.length})`}
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 pb-20">
        {tab === 'active' ? (
          <>
            {matchLoading ? (
              <div className="text-center py-8">
                <p className="text-text-secondary">Cargando partidos...</p>
              </div>
            ) : activeMatches.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-8 h-8 text-text-secondary mx-auto mb-2" />
                <p className="text-text-secondary">No hay partidos activos</p>
                <p className="text-xs text-text-secondary mt-2">
                  Inicia la jornada desde Dashboard
                </p>
              </div>
            ) : (
              activeMatches.map(match => (
                <ScoreboardCard
                  key={match.id}
                  match={match}
                  events={getEventsByMatch(match.id)}
                  onAddEvent={handleAddEvent}
                  onRemoveEvent={handleRemoveEvent}
                  onReset={handleResetMatch}
                  onEnd={reloadMatches}
                  jornada={activeJornada || undefined}
                  teamNames={teamNames}
                />
              ))
            )}
          </>
        ) : (
          <HistoryTab matches={finishedMatches} />
        )}
      </div>
    </div>
  );
}
