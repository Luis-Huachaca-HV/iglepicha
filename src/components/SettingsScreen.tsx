'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ChevronRight,
  AlertCircle,
  Check,
  Loader2,
  Lock,
  Clock,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';
import clsx from 'clsx';
import { useSession } from '../lib/session';
import {
  usuarioses,
  jornadases,
  useCollection,
} from '../lib/data';
import { ConfirmActionDialog } from './ConfirmActionDialog';

// Esquemas de validación
const usuarioSchema = z.object({
  nombre: z
    .string()
    .min(1, { error: 'El nombre es requerido' })
    .max(100, { error: 'Máximo 100 caracteres' }),
  edad: z.coerce
    .number()
    .int()
    .positive({ error: 'La edad debe ser un número positivo' })
    .nullable()
    .optional(),
  rol_sistema: z.enum(['jugador_registrado', 'capitan', 'admin', 'super_admin'], {
    errorMap: () => ({ error: 'Selecciona un rol válido' }),
  }),
  posicion: z
    .enum(['POR', 'DEF', 'MC', 'DEL'])
    .nullable()
    .optional(),
});

const tiemposSchema = z.object({
  duracion_minutos: z.coerce
    .number()
    .int()
    .positive({ error: 'La duración debe ser mayor a 0' })
    .min(5, { error: 'Mínimo 5 minutos' })
    .max(240, { error: 'Máximo 240 minutos' }),
  duracion_mini_partido_seg: z.coerce
    .number()
    .int()
    .positive({ error: 'La duración debe ser mayor a 0' })
    .min(60, { error: 'Mínimo 60 segundos' })
    .max(3600, { error: 'Máximo 3600 segundos' }),
});

const pinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{4}$/, { error: 'El PIN debe ser 4 dígitos' }),
});

type UsuarioInput = z.infer<typeof usuarioSchema>;
type TiemposInput = z.infer<typeof tiemposSchema>;
type PinInput = z.infer<typeof pinSchema>;

interface Usuario {
  id: string;
  nombre: string;
  edad?: number;
  rol_sistema: string;
  posicion?: string;
  pin_hash?: string;
  created_at: string;
  updated_at: string;
}

export default function SettingsScreen() {
  const { user } = useSession();
  const { items: usuarios, loading: usuariosLoading, reload: reloadUsuarios } = useCollection(usuarioses, {
    pageSize: 200,
  });
  const { items: jornadas } = useCollection(jornadases, { pageSize: 1 });

  const [activeSection, setActiveSection] = useState<string>('usuarios');
  const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [selectedUsuario, setSelectedUsuario] = useState<string | null>(null);

  // Formulario de usuario
  const {
    register: registerUsuario,
    handleSubmit: handleSubmitUsuario,
    reset: resetFormUsuario,
    formState: { errors: errorsUsuario, isSubmitting: submitUsuario },
    watch: watchUsuario,
  } = useForm<UsuarioInput>({
    resolver: zodResolver(usuarioSchema),
    values: editingUsuario
      ? {
          nombre: editingUsuario.nombre,
          edad: editingUsuario.edad || undefined,
          rol_sistema: editingUsuario.rol_sistema as any,
          posicion: (editingUsuario.posicion || undefined) as any,
        }
      : {
          nombre: '',
          edad: undefined,
          rol_sistema: 'jugador_registrado',
          posicion: undefined,
        },
  });

  // Formulario de tiempos
  const {
    register: registerTiempos,
    handleSubmit: handleSubmitTiempos,
    reset: resetFormTiempos,
    formState: { errors: errorsTiempos, isSubmitting: submitTiempos },
  } = useForm<TiemposInput>({
    resolver: zodResolver(tiemposSchema),
    values: jornadas[0]
      ? {
          duracion_minutos: (jornadas[0].tiempo_total_seg || 7200) / 60,
          duracion_mini_partido_seg: jornadas[0].duracion_mini_partido_seg || 900,
        }
      : {
          duracion_minutos: 120,
          duracion_mini_partido_seg: 900,
        },
  });

  // Formulario de PIN
  const {
    register: registerPin,
    handleSubmit: handleSubmitPin,
    reset: resetFormPin,
    formState: { errors: errorsPin, isSubmitting: submitPin },
  } = useForm<PinInput>({
    resolver: zodResolver(pinSchema),
  });

  // Guardar usuario
  const onSubmitUsuario = async (data: UsuarioInput) => {
    try {
      if (editingUsuario) {
        await usuarioses.update(editingUsuario.id, {
          nombre: data.nombre,
          edad: data.edad || undefined,
          rol_sistema: data.rol_sistema,
          posicion: data.posicion || undefined,
        });
        toast.success('Usuario actualizado');
      } else {
        await usuarioses.create({
          nombre: data.nombre,
          edad: data.edad || undefined,
          rol_sistema: data.rol_sistema,
          posicion: data.posicion || undefined,
        });
        toast.success('Usuario creado');
      }
      resetFormUsuario();
      setEditingUsuario(null);
      reloadUsuarios();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar usuario';
      toast.error(message);
    }
  };

  // Guardar tiempos
  const onSubmitTiempos = async (data: TiemposInput) => {
    try {
      if (!jornadas[0]) {
        toast.error('No hay jornada activa');
        return;
      }
      await jornadases.update(jornadas[0].id, {
        tiempo_total_seg: data.duracion_minutos * 60,
        duracion_mini_partido_seg: data.duracion_mini_partido_seg,
      });
      toast.success('Tiempos actualizados');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar tiempos';
      toast.error(message);
    }
  };

  // Resetear PIN de usuario
  const onSubmitPin = async (data: PinInput) => {
    if (!selectedUsuario) return;
    try {
      const response = await fetch('/api/usuarios/reset-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: selectedUsuario,
          nuevo_pin: data.pin,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al resetear PIN');
      }
      toast.success('PIN actualizado');
      resetFormPin();
      setSelectedUsuario(null);
      reloadUsuarios();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar PIN';
      toast.error(message);
    }
  };

  // Reiniciar todo (hard reset)
  const handleHardReset = async () => {
    if (resetConfirmText !== 'REINICIAR') {
      toast.error('Escribe REINICIAR para confirmar');
      return;
    }

    setResetLoading(true);
    try {
      const response = await fetch('/api/jornada/hard-reset', {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al reiniciar');
      }
      toast.success('Jornada reiniciada completamente');
      setShowConfirmReset(false);
      setResetConfirmText('');
      reloadUsuarios();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al reiniciar';
      toast.error(message);
    } finally {
      setResetLoading(false);
    }
  };

  // Eliminar usuario
  const handleDeleteUsuario = async (id: string) => {
    try {
      await usuarioses.remove(id);
      toast.success('Usuario eliminado');
      reloadUsuarios();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar';
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-[#08120F] text-[#F3F7F3]">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-[#2B4A3B] bg-[#08120F] px-4 py-4">
        <h1 className="text-24 font-bold leading-tight">Configuraciones</h1>
        <p className="text-14 text-[#B7C8BD] mt-1">Administra usuarios, roles, PIN y tiempos</p>
      </div>

      {/* Content */}
      <div className="px-4 pb-32 pt-4">
        {/* Navigation tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { id: 'usuarios', label: 'Usuarios', icon: '👤' },
            { id: 'tiempos', label: 'Tiempos', icon: '⏱️' },
            { id: 'avanzado', label: 'Avanzado', icon: '⚙️' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSection(tab.id);
                setEditingUsuario(null);
                setSelectedUsuario(null);
              }}
              className={clsx(
                'px-4 py-2 rounded-lg whitespace-nowrap text-14 font-600 transition-colors',
                activeSection === tab.id
                  ? 'bg-[#F4B942] text-[#172014]'
                  : 'bg-[#18352A] text-[#B7C8BD] active:bg-[#2B4A3B]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sección Usuarios */}
        {activeSection === 'usuarios' && (
          <div className="space-y-6">
            {/* Formulario de usuario */}
            <div className="bg-[#10231D] rounded-2xl p-6 border border-[#2B4A3B]">
              <h2 className="text-20 font-bold mb-4">
                {editingUsuario ? 'Editar Usuario' : 'Crear Usuario'}
              </h2>

              <form onSubmit={handleSubmitUsuario(onSubmitUsuario)} className="space-y-4">
                {/* Nombre */}
                <div>
                  <label className="block text-14 font-600 text-[#F3F7F3] mb-2">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre del jugador"
                    {...registerUsuario('nombre')}
                    className={clsx(
                      'w-full px-4 py-3 rounded-lg bg-[#08120F] text-[#F3F7F3] border-2 text-16',
                      'focus:outline-none focus:border-[#F4B942] transition-colors',
                      errorsUsuario.nombre ? 'border-[#E86161]' : 'border-[#2B4A3B]'
                    )}
                  />
                  {errorsUsuario.nombre && (
                    <p className="text-12 text-[#E86161] mt-1 flex items-center gap-1">
                      <AlertCircle size={14} /> {errorsUsuario.nombre.message}
                    </p>
                  )}
                </div>

                {/* Edad */}
                <div>
                  <label className="block text-14 font-600 text-[#F3F7F3] mb-2">
                    Edad (opcional)
                  </label>
                  <input
                    type="number"
                    placeholder="Edad"
                    {...registerUsuario('edad')}
                    inputMode="numeric"
                    className={clsx(
                      'w-full px-4 py-3 rounded-lg bg-[#08120F] text-[#F3F7F3] border-2 text-16',
                      'focus:outline-none focus:border-[#F4B942] transition-colors',
                      errorsUsuario.edad ? 'border-[#E86161]' : 'border-[#2B4A3B]'
                    )}
                  />
                  {errorsUsuario.edad && (
                    <p className="text-12 text-[#E86161] mt-1 flex items-center gap-1">
                      <AlertCircle size={14} /> {errorsUsuario.edad.message}
                    </p>
                  )}
                </div>

                {/* Rol */}
                <div>
                  <label className="block text-14 font-600 text-[#F3F7F3] mb-2">
                    Rol *
                  </label>
                  <select
                    {...registerUsuario('rol_sistema')}
                    className={clsx(
                      'w-full px-4 py-3 rounded-lg bg-[#08120F] text-[#F3F7F3] border-2 text-16',
                      'focus:outline-none focus:border-[#F4B942] transition-colors',
                      errorsUsuario.rol_sistema ? 'border-[#E86161]' : 'border-[#2B4A3B]'
                    )}
                  >
                    <option value="jugador_registrado">Jugador</option>
                    <option value="capitan">Capitán</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                  {errorsUsuario.rol_sistema && (
                    <p className="text-12 text-[#E86161] mt-1 flex items-center gap-1">
                      <AlertCircle size={14} /> {errorsUsuario.rol_sistema.message}
                    </p>
                  )}
                </div>

                {/* Posición */}
                <div>
                  <label className="block text-14 font-600 text-[#F3F7F3] mb-2">
                    Posición (opcional)
                  </label>
                  <select
                    {...registerUsuario('posicion')}
                    className={clsx(
                      'w-full px-4 py-3 rounded-lg bg-[#08120F] text-[#F3F7F3] border-2 text-16',
                      'focus:outline-none focus:border-[#F4B942] transition-colors',
                      errorsUsuario.posicion ? 'border-[#E86161]' : 'border-[#2B4A3B]'
                    )}
                  >
                    <option value="">Seleccionar</option>
                    <option value="POR">Portero (POR)</option>
                    <option value="DEF">Defensa (DEF)</option>
                    <option value="MC">Mediocampista (MC)</option>
                    <option value="DEL">Delantero (DEL)</option>
                  </select>
                </div>

                {/* Botones */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={submitUsuario}
                    className={clsx(
                      'flex-1 px-4 py-3 rounded-lg font-600 text-16 flex items-center justify-center gap-2',
                      'transition-all duration-150',
                      submitUsuario
                        ? 'bg-[#B7C8BD] text-[#08120F] opacity-50 cursor-not-allowed'
                        : 'bg-[#F4B942] text-[#172014] active:scale-[0.97]'
                    )}
                  >
                    {submitUsuario ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Guardando...
                      </>
                    ) : editingUsuario ? (
                      <>
                        <Check size={16} /> Actualizar
                      </>
                    ) : (
                      <>
                        <Check size={16} /> Crear
                      </>
                    )}
                  </button>
                  {editingUsuario && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUsuario(null);
                        resetFormUsuario();
                      }}
                      className={clsx(
                        'px-4 py-3 rounded-lg font-600 text-16',
                        'bg-[#18352A] text-[#B7C8BD] active:bg-[#2B4A3B] transition-colors'
                      )}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Lista de usuarios */}
            <div>
              <h3 className="text-16 font-bold mb-3 px-2">Usuarios ({usuarioses && usuarioses.length})</h3>
              {usuariosLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-[#18352A] rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : usuarios.length === 0 ? (
                <div className="bg-[#10231D] rounded-2xl p-6 border border-[#2B4A3B] text-center">
                  <p className="text-14 text-[#B7C8BD]">
                    No hay usuarios. Crea el primero usando el formulario arriba.
                  </p>
                </div>
              ) : (
                <div className="space-y-1 bg-[#10231D] rounded-2xl overflow-hidden border border-[#2B4A3B]">
                  {usuarios.map((usr, idx) => (
                    <div key={usr.id}>
                      <div className="px-4 py-3 flex items-center justify-between min-h-[44px]">
                        <div className="flex-1 min-w-0">
                          <p className="text-14 font-600 text-[#F3F7F3] truncate">{usr.nombre}</p>
                          <p className="text-12 text-[#B7C8BD] mt-0.5">
                            {usr.rol_sistema}
                            {usr.edad && ` • ${usr.edad} años`}
                            {usr.posicion && ` • ${usr.posicion}`}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => {
                              setEditingUsuario(usr as Usuario);
                              setActiveSection('usuarios');
                            }}
                            className={clsx(
                              'px-3 py-2 rounded-lg text-14 font-600',
                              'bg-[#18352A] text-[#F4B942] active:bg-[#2B4A3B] transition-colors'
                            )}
                          >
                            Editar
                          </button>
                          {(usr.rol_sistema === 'capitan' || usr.rol_sistema === 'admin' || usr.rol_sistema === 'super_admin') && (
                            <button
                              onClick={() => setSelectedUsuario(usr.id)}
                              className={clsx(
                                'px-3 py-2 rounded-lg text-14 font-600 flex items-center gap-1',
                                'bg-[#18352A] text-[#B7C8BD] active:bg-[#2B4A3B] transition-colors'
                              )}
                              title="Resetear PIN"
                            >
                              <Lock size={14} /> PIN
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm(`¿Eliminar a ${usr.nombre}?`)) {
                                handleDeleteUsuario(usr.id);
                              }
                            }}
                            className={clsx(
                              'px-3 py-2 rounded-lg text-14 font-600',
                              'bg-[#E86161] text-[#F3F7F3] active:opacity-80 transition-opacity'
                            )}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                      {idx < usuarios.length - 1 && (
                        <div className="h-px bg-[#2B4A3B] ml-4" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Formulario de PIN */}
            {selectedUsuario && (
              <div className="bg-[#10231D] rounded-2xl p-6 border border-[#2B4A3B]">
                <h3 className="text-16 font-bold mb-4 flex items-center gap-2">
                  <Lock size={18} /> Cambiar PIN
                </h3>
                <form onSubmit={handleSubmitPin(onSubmitPin)} className="space-y-4">
                  <div>
                    <label className="block text-14 font-600 text-[#F3F7F3] mb-2">
                      Nuevo PIN (4 dígitos) *
                    </label>
                    <input
                      type="password"
                      placeholder="0000"
                      {...registerPin('pin')}
                      maxLength={4}
                      inputMode="numeric"
                      className={clsx(
                        'w-full px-4 py-3 rounded-lg bg-[#08120F] text-[#F3F7F3] border-2 text-16 tracking-widest',
                        'focus:outline-none focus:border-[#F4B942] transition-colors',
                        errorsPin.pin ? 'border-[#E86161]' : 'border-[#2B4A3B]'
                      )}
                    />
                    {errorsPin.pin && (
                      <p className="text-12 text-[#E86161] mt-1 flex items-center gap-1">
                        <AlertCircle size={14} /> {errorsPin.pin.message}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={submitPin}
                      className={clsx(
                        'flex-1 px-4 py-3 rounded-lg font-600 text-16 flex items-center justify-center gap-2',
                        'transition-all duration-150',
                        submitPin
                          ? 'bg-[#B7C8BD] text-[#08120F] opacity-50 cursor-not-allowed'
                          : 'bg-[#F4B942] text-[#172014] active:scale-[0.97]'
                      )}
                    >
                      {submitPin ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          <Lock size={16} /> Guardar PIN
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUsuario(null);
                        resetFormPin();
                      }}
                      className={clsx(
                        'px-4 py-3 rounded-lg font-600 text-16',
                        'bg-[#18352A] text-[#B7C8BD] active:bg-[#2B4A3B] transition-colors'
                      )}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Sección Tiempos */}
        {activeSection === 'tiempos' && (
          <div className="space-y-6">
            <div className="bg-[#10231D] rounded-2xl p-6 border border-[#2B4A3B]">
              <h2 className="text-20 font-bold mb-2 flex items-center gap-2">
                <Clock size={20} /> Configurar Tiempos
              </h2>
              <p className="text-14 text-[#B7C8BD] mb-6">
                Duración de la jornada y de los mini partidos
              </p>

              <form onSubmit={handleSubmitTiempos(onSubmitTiempos)} className="space-y-6">
                {/* Duración jornada */}
                <div>
                  <label className="block text-14 font-600 text-[#F3F7F3] mb-2">
                    Duración de la jornada (minutos) *
                  </label>
                  <input
                    type="number"
                    placeholder="120"
                    step="5"
                    min="5"
                    max="240"
                    {...registerTiempos('duracion_minutos')}
                    inputMode="numeric"
                    className={clsx(
                      'w-full px-4 py-3 rounded-lg bg-[#08120F] text-[#F3F7F3] border-2 text-16',
                      'focus:outline-none focus:border-[#F4B942] transition-colors',
                      errorsTiempos.duracion_minutos ? 'border-[#E86161]' : 'border-[#2B4A3B]'
                    )}
                  />
                  {errorsTiempos.duracion_minutos && (
                    <p className="text-12 text-[#E86161] mt-1 flex items-center gap-1">
                      <AlertCircle size={14} /> {errorsTiempos.duracion_minutos.message}
                    </p>
                  )}
                  <p className="text-12 text-[#B7C8BD] mt-2">
                    Por defecto 120 minutos (2 horas)
                  </p>
                </div>

                {/* Duración mini partidos */}
                <div>
                  <label className="block text-14 font-600 text-[#F3F7F3] mb-2">
                    Duración de mini partidos (segundos) *
                  </label>
                  <input
                    type="number"
                    placeholder="900"
                    step="60"
                    min="60"
                    max="3600"
                    {...registerTiempos('duracion_mini_partido_seg')}
                    inputMode="numeric"
                    className={clsx(
                      'w-full px-4 py-3 rounded-lg bg-[#08120F] text-[#F3F7F3] border-2 text-16',
                      'focus:outline-none focus:border-[#F4B942] transition-colors',
                      errorsTiempos.duracion_mini_partido_seg ? 'border-[#E86161]' : 'border-[#2B4A3B]'
                    )}
                  />
                  {errorsTiempos.duracion_mini_partido_seg && (
                    <p className="text-12 text-[#E86161] mt-1 flex items-center gap-1">
                      <AlertCircle size={14} /> {errorsTiempos.duracion_mini_partido_seg.message}
                    </p>
                  )}
                  <p className="text-12 text-[#B7C8BD] mt-2">
                    Por defecto 900 segundos (15 minutos)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitTiempos}
                  className={clsx(
                    'w-full px-4 py-3 rounded-lg font-600 text-16 flex items-center justify-center gap-2',
                    'transition-all duration-150',
                    submitTiempos
                      ? 'bg-[#B7C8BD] text-[#08120F] opacity-50 cursor-not-allowed'
                      : 'bg-[#F4B942] text-[#172014] active:scale-[0.97]'
                  )}
                >
                  {submitTiempos ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Guardar Tiempos
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Sección Avanzado */}
        {activeSection === 'avanzado' && (
          <div className="space-y-6">
            {/* Mercado de pases */}
            <div className="bg-[#10231D] rounded-2xl p-6 border border-[#2B4A3B]">
              <h3 className="text-16 font-bold mb-2 flex items-center gap-2">
                <TrendingUp size={18} /> Mercado de Pases
              </h3>
              <p className="text-14 text-[#B7C8BD] mb-4">
                Permitir cambios después del draft para rebalanc
ear equipos
              </p>
              <button
                className={clsx(
                  'w-full px-4 py-3 rounded-lg font-600 text-16 transition-all duration-150',
                  'bg-[#18352A] text-[#F4B942] active:bg-[#2B4A3B]'
                )}
                disabled={!jornadas[0]}
              >
                {jornadas[0]?.permitir_cambios_post_draft ? 'Desactivar' : 'Activar'} Mercado
              </button>
            </div>

            {/* Reiniciar todo */}
            <div className="bg-[#10231D] rounded-2xl p-6 border border-[#E86161]">
              <h3 className="text-16 font-bold mb-2 flex items-center gap-2">
                <RotateCcw size={18} className="text-[#E86161]" /> Reiniciar Todo
              </h3>
              <p className="text-14 text-[#B7C8BD] mb-4">
                Borra la jornada actual por completo: asistencias, equipos, capitanes, cobranza, partidos. Los usuarios se conservan.
              </p>
              <p className="text-12 text-[#E86161] mb-4 flex items-center gap-2">
                <AlertCircle size={14} /> Esta acción no se puede deshacer
              </p>
              <button
                onClick={() => setShowConfirmReset(true)}
                className={clsx(
                  'w-full px-4 py-3 rounded-lg font-600 text-16 flex items-center justify-center gap-2',
                  'bg-[#E86161] text-[#F3F7F3] active:opacity-80 transition-opacity'
                )}
              >
                <RotateCcw size={16} /> Reiniciar Jornada
              </button>
            </div>

            {/* Info */}
            <div className="bg-[#18352A] rounded-2xl p-4 border border-[#2B4A3B]">
              <p className="text-12 text-[#B7C8BD] leading-relaxed">
                <strong>Nota:</strong> todos los cambios en configuración se replican en tiempo real a otros dispositivos.
                Los usuarios no se borran nunca, solo la jornada actual.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Diálogo de confirmación de reinicio */}
      <ConfirmActionDialog
        isOpen={showConfirmReset}
        onClose={() => {
          setShowConfirmReset(false);
          setResetConfirmText('');
        }}
        title="Reiniciar la jornada"
        description="Esto borrará toda la asistencia, equipos, capitanes, cobranza y partidos del día. Los usuarios se conservan. Escribe REINICIAR para confirmar."
        confirmText="Reiniciar"
        isDangerous
        isLoading={resetLoading}
        onConfirm={handleHardReset}
        customContent={
          <div className="mt-4">
            <label className="block text-14 font-600 text-[#F3F7F3] mb-2">
              Escribe "REINICIAR" para continuar *
            </label>
            <input
              type="text"
              placeholder="REINICIAR"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
              className={clsx(
                'w-full px-4 py-3 rounded-lg bg-[#08120F] text-[#F3F7F3] border-2 text-16 font-600 tracking-widest',
                'focus:outline-none focus:border-[#F4B942] transition-colors',
                resetConfirmText === 'REINICIAR' ? 'border-[#43C47A]' : 'border-[#2B4A3B]'
              )}
              autoFocus
            />
          </div>
        }
      />
    </div>
  );
}
