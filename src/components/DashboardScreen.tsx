'use client';

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Clock,
  Users,
  AlertCircle,
  Play,
  Square,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';
import { useSession } from '../lib/session';
import {
  jornadases,
  equipos_jornadas,
  asistencia_drafts,
  useCollection,
} from '../lib/data';
import { RealtimeStatus } from './RealtimeStatus';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DashboardScreen() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [currentJornada, setCurrentJornada] = useState<any>(null);
  const [showConfirmStart, setShowConfirmStart] = useState(false);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const [showConfirmNew, setShowConfirmNew] = useState(false);
  const [costInput, setCostInput] = useState('');
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load current jornada
  const {
    items: jornadas,
    loading: jornadasLoading,
    error: jornadasError,
    reload: reloadJornadas,
  } = useCollection(jornadases, {
    match: { estado: ['en_curso', 'draft_en_curso', 'esperando_cobranza'] },
    pageSize: 1,
  });

  // Load teams for current jornada
  const {
    items: teams,
    loading: teamsLoading,
  } = useCollection(equipos_jornadas, {
    match: currentJornada ? { jornada_id: currentJornada.id } : undefined,
  });

  // Load attendance for current jornada
  const {
    items: attendance,
    loading: attendanceLoading,
  } = useCollection(asistencia_drafts, {
    match: currentJornada
      ? { jornada_id: currentJornada.id, presente: true }
      : undefined,
  });

  useEffect(() => {
    if (jornadas && jornadas.length > 0) {
      setCurrentJornada(jornadas[0]);
    } else {
      setCurrentJornada(null);
    }
  }, [jornadas]);

  // Timer logic
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    if (!currentJornada || currentJornada.estado !== 'en_curso') {
      setTimeElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentJornada]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleStartJornada = useCallback(async () => {
    if (!currentJornada) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/jornada/estado', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jornada_id: currentJornada.id, estado: 'en_curso' }),
      });
      if (!res.ok) throw new Error('Error al iniciar jornada');
      toast.success('Jornada iniciada');
      reloadJornadas();
      setShowConfirmStart(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, [currentJornada, reloadJornadas]);

  const handleEndJornada = useCallback(async () => {
    if (!currentJornada) return;
    setShowConfirmEnd(false);
    setShowCostDialog(true);
  }, [currentJornada]);

  const handleSubmitCost = useCallback(async () => {
    if (!currentJornada || !costInput.trim()) {
      toast.error('Ingresa el costo total');
      return;
    }

    const cost = parseFloat(costInput);
    if (isNaN(cost) || cost < 0) {
      toast.error('Costo inválido');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/cobranza/costo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jornada_id: currentJornada.id,
          costo_total: cost,
        }),
      });
      if (!res.ok) throw new Error('Error al registrar costo');
      toast.success('Costo registrado. Ve a Cobranza para continuar.');
      setShowCostDialog(false);
      setCostInput('');
      reloadJornadas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, [currentJornada, costInput, reloadJornadas]);

  const handleNewJornada = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/jornada/nueva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creado_por: user.id,
        }),
      });
      if (!res.ok) throw new Error('Error al crear jornada');
      toast.success('Nueva jornada creada');
      setShowConfirmNew(false);
      reloadJornadas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, [user, reloadJornadas]);

  const isAdmin = user && ['admin', 'super_admin'].includes(user.role);

  return (
    <div className="min-h-screen bg-[#08120F] text-[#F3F7F3] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#10231D] border-b border-[#2B4A3B] px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-24 font-bold font-['Space Grotesk'] tracking-tight">
            Gestión de Pichangas
          </h1>
          <p className="text-14 text-[#B7C8BD] mt-1">Resumen de la jornada</p>
        </div>
        <RealtimeStatus />
      </div>

      {/* Main Content */}
      <div className="px-4 py-6 space-y-6">
        {/* No jornada active */}
        {!currentJornada && (
          <div className="bg-[#18352A] rounded-2xl p-6 border border-[#2B4A3B] text-center">
            <AlertCircle className="w-12 h-12 text-[#F4B942] mx-auto mb-4" />
            <p className="text-16 font-600 mb-2">No hay jornada en curso</p>
            <p className="text-14 text-[#B7C8BD] mb-6">
              Comienza creando una nueva jornada para registrar asistencia y
              comenzar el draft.
            </p>
            {isAdmin && (
              <button
                onClick={() => handleNewJornada()}
                disabled={isLoading}
                className="w-full py-3 bg-[#F4B942] text-[#172014] font-600 rounded-lg hover:bg-yellow-400 active:scale-[0.97] transition-all duration-150 disabled:opacity-50"
              >
                {isLoading ? 'Creando...' : 'Crear jornada nueva'}
              </button>
            )}
          </div>
        )}

        {currentJornada && (
          <>
            {/* Timer Section - Tablero style */}
            <div className="bg-[#10231D] rounded-2xl p-8 border-2 border-[#F4B942] relative overflow-hidden">
              {/* Decorative lines (pitch markings) */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1 h-full bg-gradient-to-b from-[#F4B942]/20 to-transparent opacity-30" />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-0 w-full h-px bg-[#2B4A3B]" />
                <div className="absolute top-0 left-1/2 w-px h-full bg-[#2B4A3B]/30 transform -translate-x-1/2" />
              </div>

              <div className="relative text-center">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Clock className="w-6 h-6 text-[#F4B942]" />
                  <p className="text-14 font-600 text-[#B7C8BD] uppercase tracking-wide">
                    Tiempo de jornada
                  </p>
                </div>
                <div className="text-64 font-bold font-['Space Grotesk'] text-[#F4B942] tracking-tight mb-2 font-mono">
                  {formatTime(timeElapsed)}
                </div>
                <p className="text-14 text-[#B7C8BD]">
                  Estado:{' '}
                  <span className="font-600 capitalize">
                    {currentJornada.estado === 'en_curso'
                      ? 'En curso'
                      : currentJornada.estado === 'draft_en_curso'
                        ? 'Draft en curso'
                        : 'Esperando cobranza'}
                  </span>
                </p>
              </div>
            </div>

            {/* Creator Info */}
            <div className="bg-[#18352A] rounded-2xl p-6 border border-[#2B4A3B]">
              <p className="text-12 text-[#B7C8BD] uppercase tracking-wide font-600 mb-2">
                Creado por
              </p>
              <p className="text-18 font-600">
                {currentJornada.creado_por === user?.id ? 'Tú' : 'Otro admin'}
              </p>
              <p className="text-13 text-[#B7C8BD] mt-2">
                {currentJornada.created_at
                  ? formatDistanceToNow(new Date(currentJornada.created_at), {
                      locale: es,
                      addSuffix: true,
                    })
                  : '—'}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Present Players */}
              <div className="bg-[#18352A] rounded-2xl p-6 border border-[#2B4A3B]">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-5 h-5 text-[#43C47A]" />
                  <p className="text-12 text-[#B7C8BD] uppercase tracking-wide font-600">
                    Presentes
                  </p>
                </div>
                <p className="text-32 font-bold font-['Space Grotesk']">
                  {attendanceLoading ? '—' : attendance.length}
                </p>
              </div>

              {/* Teams */}
              <div className="bg-[#18352A] rounded-2xl p-6 border border-[#2B4A3B]">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-5 h-5 text-[#F4B942]" />
                  <p className="text-12 text-[#B7C8BD] uppercase tracking-wide font-600">
                    Equipos
                  </p>
                </div>
                <p className="text-32 font-bold font-['Space Grotesk']">
                  {teamsLoading ? '—' : teams.length}
                </p>
              </div>
            </div>

            {/* Admin Actions */}
            {isAdmin && (
              <div className="space-y-3">
                {currentJornada.estado === 'draft_en_curso' && (
                  <button
                    onClick={() => setShowConfirmStart(true)}
                    disabled={isLoading}
                    className="w-full flex items-center justify-between py-4 px-4 bg-[#43C47A] text-[#08120F] font-600 rounded-lg hover:bg-green-400 active:scale-[0.97] transition-all duration-150 disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <Play className="w-5 h-5" />
                      <span>Iniciar jornada</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}

                {currentJornada.estado === 'en_curso' && (
                  <button
                    onClick={() => setShowConfirmEnd(true)}
                    disabled={isLoading}
                    className="w-full flex items-center justify-between py-4 px-4 bg-[#E86161] text-white font-600 rounded-lg hover:bg-red-600 active:scale-[0.97] transition-all duration-150 disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <Square className="w-5 h-5" />
                      <span>Finalizar jornada</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}

                {currentJornada.estado === 'esperando_cobranza' && (
                  <button
                    onClick={() =>
                      navigate(
                        `/cobranza?jornada_id=${currentJornada.id}`
                      )
                    }
                    className="w-full flex items-center justify-between py-4 px-4 bg-[#F4B942] text-[#172014] font-600 rounded-lg hover:bg-yellow-400 active:scale-[0.97] transition-all duration-150"
                  >
                    <div className="flex items-center gap-3">
                      <span>Ir a cobranza</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}

                {(!currentJornada.estado ||
                  currentJornada.estado === 'completada' ||
                  currentJornada.estado === 'esperando_cobranza') && (
                    <button
                      onClick={() => setShowConfirmNew(true)}
                      disabled={isLoading}
                      className="w-full flex items-center justify-between py-4 px-4 bg-[#18352A] text-[#F4B942] font-600 rounded-lg hover:bg-[#2B4A3B] active:scale-[0.97] transition-all duration-150 border border-[#2B4A3B] disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <RotateCcw className="w-5 h-5" />
                        <span>Comenzar jornada nueva</span>
                      </div>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
              </div>
            )}

            {/* Quick Links to Other Screens */}
            <div className="space-y-3 pt-4">
              <button
                onClick={() => navigate('/jugadores')}
                className="w-full flex items-center justify-between py-4 px-4 bg-[#18352A] hover:bg-[#2B4A3B] rounded-lg border border-[#2B4A3B] transition-all duration-150 active:scale-[0.97]"
              >
                <span className="font-600">Asistencia y jugadores</span>
                <ChevronRight className="w-5 h-5 text-[#B7C8BD]" />
              </button>

              <button
                onClick={() => navigate('/draft')}
                className="w-full flex items-center justify-between py-4 px-4 bg-[#18352A] hover:bg-[#2B4A3B] rounded-lg border border-[#2B4A3B] transition-all duration-150 active:scale-[0.97]"
              >
                <span className="font-600">Draft de equipos</span>
                <ChevronRight className="w-5 h-5 text-[#B7C8BD]" />
              </button>

              <button
                onClick={() => navigate('/partidos')}
                className="w-full flex items-center justify-between py-4 px-4 bg-[#18352A] hover:bg-[#2B4A3B] rounded-lg border border-[#2B4A3B] transition-all duration-150 active:scale-[0.97]"
              >
                <span className="font-600">Partidos</span>
                <ChevronRight className="w-5 h-5 text-[#B7C8BD]" />
              </button>
            </div>
          </>
        )}

        {/* Error State */}
        {jornadasError && (
          <div className="bg-[#E86161]/10 border border-[#E86161] rounded-2xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-[#E86161] mx-auto mb-3" />
            <p className="text-14 text-[#F3F7F3]">
              Error al cargar la jornada
            </p>
            <button
              onClick={() => reloadJornadas()}
              className="mt-4 px-6 py-2 bg-[#E86161] text-white font-600 rounded-lg hover:bg-red-600 active:scale-[0.97] transition-all duration-150"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmActionDialog
        isOpen={showConfirmStart}
        title="Iniciar jornada"
        description="Se comenzarán los partidos. Ya no se podrán agregar jugadores."
        confirmText="Iniciar"
        cancelText="Cancelar"
        onConfirm={handleStartJornada}
        onCancel={() => setShowConfirmStart(false)}
        isLoading={isLoading}
        isDangerous={false}
      />

      <ConfirmActionDialog
        isOpen={showConfirmEnd}
        title="Finalizar jornada"
        description="Se terminarán los partidos. Ve al siguiente paso: registrar el costo total."
        confirmText="Finalizar"
        cancelText="Cancelar"
        onConfirm={handleEndJornada}
        onCancel={() => setShowConfirmEnd(false)}
        isLoading={isLoading}
        isDangerous={false}
      />

      <ConfirmActionDialog
        isOpen={showConfirmNew}
        title="Comenzar jornada nueva"
        description="Se resetearán asistencia, equipos y partidos. Los usuarios se mantienen."
        confirmText="Continuar"
        cancelText="Cancelar"
        onConfirm={handleNewJornada}
        onCancel={() => setShowConfirmNew(false)}
        isLoading={isLoading}
        isDangerous={false}
      />

      {/* Cost Dialog */}
      {showCostDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center">
          <div className="w-full sm:w-96 bg-[#10231D] rounded-t-3xl sm:rounded-2xl p-6 border border-[#2B4A3B] space-y-4">
            <div>
              <h2 className="text-20 font-bold font-['Space Grotesk']">
                Registrar costo
              </h2>
              <p className="text-14 text-[#B7C8BD] mt-2">
                Ingresa el costo total de la jornada.
              </p>
            </div>

            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 bg-[#08120F] border border-[#2B4A3B] rounded-lg text-[#F3F7F3] placeholder-[#B7C8BD] text-16 focus:outline-none focus:border-[#F4B942]"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCostDialog(false);
                  setCostInput('');
                }}
                className="flex-1 py-3 px-4 bg-[#18352A] text-[#F3F7F3] font-600 rounded-lg hover:bg-[#2B4A3B] active:scale-[0.97] transition-all duration-150 border border-[#2B4A3B]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitCost}
                disabled={isLoading}
                className="flex-1 py-3 px-4 bg-[#F4B942] text-[#172014] font-600 rounded-lg hover:bg-yellow-400 active:scale-[0.97] transition-all duration-150 disabled:opacity-50"
              >
                {isLoading ? 'Guardando...' : 'Guardar costo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
