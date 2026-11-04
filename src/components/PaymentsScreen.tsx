'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSession } from '../lib/session';
import {
  jornadases,
  equipos_jornadas,
  asistencia_drafts,
  usuarioses,
  useCollection,
} from '../lib/data';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { RealtimeStatus } from './RealtimeStatus';
import { AlertCircle, Check, Clock, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';

export default function PaymentsScreen() {
  const { user } = useSession();
  const [activeJornada, setActiveJornada] = useState<string | null>(null);
  const [costTotal, setCostTotal] = useState<number | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState<string | null>(null);
  const [confirmingDelivery, setConfirmingDelivery] = useState<string | null>(null);
  const [loadingPaymentId, setLoadingPaymentId] = useState<string | null>(null);
  const [loadingDeliveryId, setLoadingDeliveryId] = useState<string | null>(null);

  // Cargar jornada actual
  const { items: jornadas } = useCollection(jornadases, {
    pageSize: 1,
    match: { estado: 'en_curso' },
  });

  // Cargar equipos de la jornada actual
  const { items: equipos, reload: reloadEquipos } = useCollection(equipos_jornadas, {
    match: activeJornada ? { jornada_id: activeJornada } : undefined,
  });

  // Cargar asistencias de la jornada
  const { items: asistencias } = useCollection(asistencia_drafts, {
    match: activeJornada ? { jornada_id: activeJornada } : undefined,
  });

  // Cargar todos los usuarios para mapeo de nombres
  const { items: allUsuarios } = useCollection(usuarioses);

  // Al cambiar jornada, obtener el costo total
  useEffect(() => {
    if (jornadas.length > 0) {
      const current = jornadas[0];
      setActiveJornada(current.id);
      setCostTotal(current.costo_total ?? null);
    } else {
      setActiveJornada(null);
      setCostTotal(null);
    }
  }, [jornadas]);

  const usuarioMap = useMemo(() => {
    const map = new Map<string, (typeof allUsuarios)[0]>();
    allUsuarios.forEach((u) => map.set(u.id, u));
    return map;
  }, [allUsuarios]);

  // Calcular cuota por equipo
  const cuotaPorEquipo = useMemo(() => {
    if (!costTotal || equipos.length === 0) return 0;
    return Math.round(costTotal / equipos.length);
  }, [costTotal, equipos.length]);

  // Construir estado de pagos por equipo
  interface EquipoPaymentState {
    equipo: (typeof equipos)[0];
    capitanUser: (typeof allUsuarios)[0] | undefined;
    jugadoresPendientes: (typeof asistencias)[0][];
    todosLosJugadores: (typeof asistencias)[0][];
    capitalPago: boolean;
    totalEntregadoAdmin: boolean;
  }

  const equipoPaymentStates = useMemo(() => {
    return equipos.map((equipo): EquipoPaymentState => {
      const jugadores = asistencias.filter(
        (a) => a.equipo_id === equipo.id && a.presente
      );
      const pendientes = jugadores.filter((j) => !j.pago_realizado);
      const capitanUser = usuarioMap.get(equipo.capitan_id);

      return {
        equipo,
        capitanUser,
        jugadoresPendientes: pendientes,
        todosLosJugadores: jugadores,
        capitalPago: jugadores.every((j) => j.pago_realizado),
        totalEntregadoAdmin: equipo.pago_entregado_admin,
      };
    });
  }, [equipos, asistencias, usuarioMap]);

  // Marcar pago de jugador
  const handlePlayerPayment = async (asistenciaId: string) => {
    setLoadingPaymentId(asistenciaId);
    try {
      await asistencia_drafts.update(asistenciaId, { pago_realizado: true });
      toast.success('Pago confirmado');
      await reloadEquipos();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al confirmar pago';
      toast.error(msg);
    } finally {
      setLoadingPaymentId(null);
      setConfirmingPayment(null);
    }
  };

  // Marcar entrega al admin
  const handleDeliveryToAdmin = async (equipoId: string) => {
    setLoadingDeliveryId(equipoId);
    try {
      await equipos_jornadas.update(equipoId, { pago_entregado_admin: true });
      toast.success('Entrega confirmada al admin');
      await reloadEquipos();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al confirmar entrega';
      toast.error(msg);
    } finally {
      setLoadingDeliveryId(null);
      setConfirmingDelivery(null);
    }
  };

  // Si no hay jornada en curso
  if (!activeJornada) {
    return (
      <div className="min-h-screen bg-[#08120F] text-[#F3F7F3] p-4 pt-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6 font-['Space_Grotesk']">Cobranza</h1>
          <div className="bg-[#10231D] rounded-2xl p-6 border border-[#2B4A3B] text-center">
            <Clock className="w-12 h-12 mx-auto mb-4 text-[#B7C8BD]" />
            <p className="text-base text-[#B7C8BD] mb-2">
              No hay una jornada en curso
            </p>
            <p className="text-sm text-[#B7C8BD]">
              La cobranza se abre cuando el admin finaliza la jornada.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Si no hay costo total registrado
  if (costTotal === null) {
    return (
      <div className="min-h-screen bg-[#08120F] text-[#F3F7F3] p-4 pt-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6 font-['Space_Grotesk']">Cobranza</h1>
          <div className="bg-[#10231D] rounded-2xl p-6 border border-[#2B4A3B] text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-[#E86161]" />
            <p className="text-base text-[#F3F7F3] mb-2">Falta asignar el costo total</p>
            <p className="text-sm text-[#B7C8BD]">
              El admin debe ingresar el monto antes de comenzar la cobranza.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Si no hay equipos
  if (equipoPaymentStates.length === 0) {
    return (
      <div className="min-h-screen bg-[#08120F] text-[#F3F7F3] p-4 pt-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6 font-['Space_Grotesk']">Cobranza</h1>
          <div className="bg-[#10231D] rounded-2xl p-6 border border-[#2B4A3B] text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-[#B7C8BD]" />
            <p className="text-base text-[#B7C8BD]">No hay equipos en esta jornada</p>
          </div>
        </div>
      </div>
    );
  }

  const allDeliveredToAdmin = equipoPaymentStates.every((e) => e.totalEntregadoAdmin);
  const userRole = usuarioMap.get(user?.id ?? '')?.rol_sistema;
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  return (
    <div className="min-h-screen bg-[#08120F] text-[#F3F7F3] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#08120F] border-b border-[#2B4A3B] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-['Space_Grotesk']">Cobranza</h1>
            <p className="text-sm text-[#B7C8BD]">Dos niveles: jugador → capitán → admin</p>
          </div>
          <RealtimeStatus />
        </div>
      </div>

      {/* Resumen */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-[#10231D] rounded-2xl p-4 border border-[#2B4A3B] mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[#B7C8BD] mb-1">Costo total</p>
              <p className="text-2xl font-bold text-[#F4B942]">
                ${costTotal?.toLocaleString('es-ES')}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#B7C8BD] mb-1">Cuota por equipo</p>
              <p className="text-2xl font-bold text-[#43C47A]">
                ${cuotaPorEquipo.toLocaleString('es-ES')}
              </p>
            </div>
          </div>
        </div>

        {/* Estado general */}
        <div className="bg-[#10231D] rounded-2xl p-4 border border-[#2B4A3B] mb-6">
          <p className="text-sm font-semibold mb-2">Estado general</p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <div
                className={clsx(
                  'w-2 h-2 rounded-full',
                  equipoPaymentStates.every((e) => e.capitalPago)
                    ? 'bg-[#43C47A]'
                    : 'bg-[#F4B942]'
                )}
              />
              <span className="text-[#B7C8BD]">
                {equipoPaymentStates.filter((e) => e.capitalPago).length} de{' '}
                {equipoPaymentStates.length} equipos: jugadores pagaron
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={clsx(
                  'w-2 h-2 rounded-full',
                  allDeliveredToAdmin ? 'bg-[#43C47A]' : 'bg-[#F4B942]'
                )}
              />
              <span className="text-[#B7C8BD]">
                {equipoPaymentStates.filter((e) => e.totalEntregadoAdmin).length} de{' '}
                {equipoPaymentStates.length} equipos: entregaron al admin
              </span>
            </div>
          </div>
        </div>

        {/* Equipos y pagos */}
        <div className="space-y-4">
          {equipoPaymentStates.map((state, idx) => (
            <EquipoPaymentCard
              key={state.equipo.id}
              state={state}
              cuotaPorEquipo={cuotaPorEquipo}
              onPlayerPayment={(asistenciaId) => setConfirmingPayment(asistenciaId)}
              onDeliveryToAdmin={() => setConfirmingDelivery(state.equipo.id)}
              isAdmin={isAdmin}
              currentUserId={user?.id ?? ''}
              loadingPaymentId={loadingPaymentId}
              loadingDeliveryId={loadingDeliveryId}
            />
          ))}
        </div>

        {/* Botón de cierre solo si todo está pagado */}
        {allDeliveredToAdmin && isAdmin && (
          <div className="mt-8 p-4 bg-[#18352A] rounded-2xl border border-[#43C47A]">
            <p className="text-sm text-[#B7C8BD] mb-3">
              ✓ Todos los pagos fueron entregados al admin. Puedes cerrar la jornada desde el
              Dashboard.
            </p>
          </div>
        )}
      </div>

      {/* Diálogos de confirmación */}
      {confirmingPayment && (
        <ConfirmActionDialog
          title="Confirmar pago de jugador"
          description="Este pago no se puede deshacer. ¿Confirmas que el jugador pagó su cuota?"
          actionLabel="Confirmar pago"
          onConfirm={() => handlePlayerPayment(confirmingPayment)}
          onCancel={() => setConfirmingPayment(null)}
          isDangerous={false}
          isLoading={loadingPaymentId === confirmingPayment}
        />
      )}

      {confirmingDelivery && (
        <ConfirmActionDialog
          title="Confirmar entrega al admin"
          description={`Este capitán entregará $${cuotaPorEquipo.toLocaleString('es-ES')} al admin. Esta acción no se puede deshacer.`}
          actionLabel="Confirmar entrega"
          onConfirm={() => handleDeliveryToAdmin(confirmingDelivery)}
          onCancel={() => setConfirmingDelivery(null)}
          isDangerous={false}
          isLoading={loadingDeliveryId === confirmingDelivery}
        />
      )}
    </div>
  );
}

interface EquipoPaymentCardProps {
  state: {
    equipo: any;
    capitanUser: any;
    jugadoresPendientes: any[];
    todosLosJugadores: any[];
    capitalPago: boolean;
    totalEntregadoAdmin: boolean;
  };
  cuotaPorEquipo: number;
  onPlayerPayment: (asistenciaId: string) => void;
  onDeliveryToAdmin: () => void;
  isAdmin: boolean;
  currentUserId: string;
  loadingPaymentId: string | null;
  loadingDeliveryId: string | null;
}

function EquipoPaymentCard({
  state,
  cuotaPorEquipo,
  onPlayerPayment,
  onDeliveryToAdmin,
  isAdmin,
  currentUserId,
  loadingPaymentId,
  loadingDeliveryId,
}: EquipoPaymentCardProps) {
  const {
    equipo,
    capitanUser,
    jugadoresPendientes,
    todosLosJugadores,
    capitalPago,
    totalEntregadoAdmin,
  } = state;

  const isCurrentUserCapitan = currentUserId === equipo.capitan_id;
  const isCurrentUserAdmin = isAdmin;
  const canMarkPlayerPayment = isCurrentUserCapitan || isCurrentUserAdmin;
  const canMarkDeliveryToAdmin = isCurrentUserCapitan || isCurrentUserAdmin;

  return (
    <div
      className={clsx(
        'rounded-2xl border p-4 transition-colors',
        totalEntregadoAdmin
          ? 'bg-[#10231D] border-[#43C47A]'
          : 'bg-[#10231D] border-[#2B4A3B]'
      )}
    >
      {/* Encabezado del equipo */}
      <div className="mb-4 pb-4 border-b border-[#2B4A3B]">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-[#B7C8BD]">Equipo</p>
            <p className="text-lg font-bold text-[#F3F7F3]">
              {capitanUser?.nombre || 'Capitán desconocido'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {capitalPago && (
              <span className="flex items-center gap-1 px-2 py-1 bg-[#18352A] rounded-lg border border-[#43C47A]">
                <Check className="w-4 h-4 text-[#43C47A]" />
                <span className="text-xs text-[#43C47A] font-semibold">Pagado</span>
              </span>
            )}
            {totalEntregadoAdmin && (
              <span className="flex items-center gap-1 px-2 py-1 bg-[#18352A] rounded-lg border border-[#43C47A]">
                <Check className="w-4 h-4 text-[#43C47A]" />
                <span className="text-xs text-[#43C47A] font-semibold">Entregado</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Nivel 1: Jugadores pagan al capitán */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-sm font-semibold text-[#F3F7F3]">
            Nivel 1: Jugadores pagan al capitán
          </p>
          <p className="text-xs text-[#B7C8BD]">
            {todosLosJugadores.length - jugadoresPendientes.length} de{' '}
            {todosLosJugadores.length}
          </p>
        </div>

        {todosLosJugadores.length === 0 ? (
          <p className="text-sm text-[#B7C8BD] italic">Sin jugadores</p>
        ) : (
          <div className="space-y-2">
            {todosLosJugadores.map((asistencia) => {
              const isPago = asistencia.pago_realizado;
              const isLoading = loadingPaymentId === asistencia.id;
              return (
                <div
                  key={asistencia.id}
                  className={clsx(
                    'flex items-center justify-between p-3 rounded-lg border transition-colors',
                    isPago
                      ? 'bg-[#08120F] border-[#43C47A]'
                      : 'bg-[#08120F] border-[#2B4A3B]'
                  )}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <User className="w-4 h-4 text-[#B7C8BD] flex-shrink-0" />
                    <span className="text-sm text-[#F3F7F3] truncate">
                      {asistencia.usuario_id}
                    </span>
                  </div>
                  {isPago ? (
                    <div className="flex items-center gap-2 text-[#43C47A]">
                      <Check className="w-4 h-4" />
                      <span className="text-xs font-semibold">Pagó</span>
                    </div>
                  ) : canMarkPlayerPayment ? (
                    <button
                      onClick={() => onPlayerPayment(asistencia.id)}
                      disabled={isLoading}
                      className={clsx(
                        'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all active:scale-95',
                        isLoading
                          ? 'bg-[#2B4A3B] border-[#2B4A3B] text-[#B7C8BD] cursor-not-allowed opacity-60'
                          : 'bg-[#F4B942] border-[#F4B942] text-[#172014] hover:bg-yellow-600'
                      )}
                    >
                      {isLoading ? 'Confirmando...' : 'Marcar pago'}
                    </button>
                  ) : (
                    <span className="text-xs text-[#B7C8BD] font-semibold">Pendiente</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Nivel 2: Capitán entrega al admin */}
      <div className="pt-4 border-t border-[#2B4A3B]">
        <div className="mb-3">
          <p className="text-sm font-semibold text-[#F3F7F3] mb-2">
            Nivel 2: Capitán entrega al admin
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-[#B7C8BD]">Total a entregar</span>
            <span className="text-lg font-bold text-[#F4B942]">
              ${cuotaPorEquipo.toLocaleString('es-ES')}
            </span>
          </div>
        </div>

        {totalEntregadoAdmin ? (
          <div className="flex items-center gap-2 px-3 py-3 bg-[#18352A] rounded-lg border border-[#43C47A]">
            <Check className="w-4 h-4 text-[#43C47A]" />
            <span className="text-sm text-[#43C47A] font-semibold">Entregado al admin</span>
          </div>
        ) : capitalPago ? (
          canMarkDeliveryToAdmin ? (
            <button
              onClick={onDeliveryToAdmin}
              disabled={loadingDeliveryId === equipo.id}
              className={clsx(
                'w-full px-4 py-3 text-sm font-bold rounded-lg border transition-all active:scale-95',
                loadingDeliveryId === equipo.id
                  ? 'bg-[#2B4A3B] border-[#2B4A3B] text-[#B7C8BD] cursor-not-allowed opacity-60'
                  : 'bg-[#F4B942] border-[#F4B942] text-[#172014] hover:bg-yellow-600'
              )}
            >
              {loadingDeliveryId === equipo.id ? 'Confirmando...' : 'Confirmar entrega al admin'}
            </button>
          ) : (
            <div className="px-4 py-3 bg-[#08120F] rounded-lg border border-[#2B4A3B]">
              <p className="text-sm text-[#B7C8BD]">
                El capitán debe confirmar la entrega al admin
              </p>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2 px-3 py-3 bg-[#08120F] rounded-lg border border-[#F4B942]">
            <Clock className="w-4 h-4 text-[#F4B942]" />
            <span className="text-sm text-[#F4B942] font-semibold">
              Esperando pagos de jugadores
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
