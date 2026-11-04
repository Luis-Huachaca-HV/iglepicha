'use client';

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSession, signIn } from '../lib/session';
import { usuarioses, useCollection } from '../lib/data';
import { AlertCircle, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';

type AuthMode = 'select-player' | 'pin-entry';

interface AuthState {
  mode: AuthMode;
  selectedUserId: string | null;
  pin: string;
  error: string;
  isLoading: boolean;
}

export default function LoginScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: sessionLoading, demo } = useSession();
  const { items: usuarios, loading: usuariosLoading } = useCollection(usuarioses);

  const [authState, setAuthState] = useState<AuthState>({
    mode: 'select-player',
    selectedUserId: null,
    pin: '',
    error: '',
    isLoading: false,
  });

  // Redirect if already logged in
  useEffect(() => {
    if (!sessionLoading && user) {
      const from = location.state?.from;
      const destination =
        from && typeof from === 'string' && from.startsWith('/') ? from : '/dashboard';
      navigate(destination, { replace: true });
    }
  }, [user, sessionLoading, navigate, location]);

  const selectedUser = usuarios.find((u) => u.id === authState.selectedUserId);
  const isRegisteredPlayer = selectedUser?.rol_sistema === 'jugador_registrado';

  /**
   * Step 1: Player selected — determine if PIN entry or direct login
   */
  const handleSelectPlayer = (usuarioId: string) => {
    const usuario = usuarios.find((u) => u.id === usuarioId);
    if (!usuario) return;

    setAuthState((prev) => ({
      ...prev,
      selectedUserId: usuarioId,
      mode: usuario.rol_sistema === 'jugador_registrado' ? 'pin-entry' : 'pin-entry',
      pin: '',
      error: '',
    }));
  };

  /**
   * Step 2: PIN entered or registered player confirmed
   */
  const handlePinSubmit = async (inputPin?: string) => {
    if (!selectedUser) return;

    const pinToUse = inputPin !== undefined ? inputPin : authState.pin;

    // Registered players don't need PIN verification
    if (isRegisteredPlayer && pinToUse === '') {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: '' }));
      try {
        // Sign in as registered player using their ID as pseudo-password
        await signIn(selectedUser.email || `${selectedUser.id}@interno`, selectedUser.id);
        toast.success(`Bienvenido, ${selectedUser.nombre}!`);
        const from = location.state?.from;
        const destination =
          from && typeof from === 'string' && from.startsWith('/') ? from : '/dashboard';
        navigate(destination, { replace: true });
      } catch (err) {
        const errorMsg =
          err instanceof Error
            ? err.message === 'account_exists'
              ? 'Esta cuenta ya existe'
              : err.message
            : 'Error al iniciar sesión';
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
          mode: 'select-player',
          selectedUserId: null,
          pin: '',
        }));
        toast.error(errorMsg);
      }
      return;
    }

    // For admin/capitan: verify PIN
    if (!pinToUse || pinToUse.length !== 4) {
      setAuthState((prev) => ({
        ...prev,
        error: 'El PIN debe tener 4 dígitos',
      }));
      return;
    }

    setAuthState((prev) => ({ ...prev, isLoading: true, error: '' }));

    try {
      // Sign in with PIN (backend will verify)
      await signIn(selectedUser.email || `${selectedUser.id}@interno`, pinToUse);
      toast.success(`Bienvenido, ${selectedUser.nombre}!`);
      const from = location.state?.from;
      const destination =
        from && typeof from === 'string' && from.startsWith('/') ? from : '/dashboard';
      navigate(destination, { replace: true });
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message === 'invalid_credentials'
            ? 'PIN incorrecto'
            : err.message
          : 'Error al iniciar sesión';
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
        pin: '',
      }));
      toast.error(errorMsg);
    }
  };

  const handleBackToPlayers = () => {
    setAuthState({
      mode: 'select-player',
      selectedUserId: null,
      pin: '',
      error: '',
      isLoading: false,
    });
  };

  const handlePinChange = (digit: string) => {
    setAuthState((prev) => {
      const newPin = (prev.pin + digit).slice(0, 4);
      return { ...prev, pin: newPin, error: '' };
    });
  };

  const handlePinBackspace = () => {
    setAuthState((prev) => ({
      ...prev,
      pin: prev.pin.slice(0, -1),
      error: '',
    }));
  };

  const isLoading = sessionLoading || usuariosLoading || authState.isLoading;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#08120F] px-4 py-8 safe-area">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1
          className="text-4xl font-bold text-[#F3F7F3] mb-2"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Gestión de Pichangas
        </h1>
        <p className="text-[#B7C8BD] text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
          Inicia sesión para continuar
        </p>
      </div>

      {/* Demo notice */}
      {demo && (
        <div className="mb-6 w-full max-w-sm px-4 py-3 bg-[#10231D] border border-[#2B4A3B] rounded-lg">
          <p className="text-xs text-[#B7C8BD]" style={{ fontFamily: 'Inter, sans-serif' }}>
            <span className="font-semibold">Modo demo:</span> Los datos no se guardan. Conecta un
            proyecto de Supabase en Connectors.
          </p>
        </div>
      )}

      {/* Player Selection Screen */}
      {authState.mode === 'select-player' && (
        <div className="w-full max-w-sm">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 bg-[#10231D] rounded-lg animate-pulse border border-[#2B4A3B]"
                />
              ))}
            </div>
          ) : usuarios.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#B7C8BD] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                No hay usuarios registrados aún.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {usuarios.map((usuario) => (
                <button
                  key={usuario.id}
                  onClick={() => handleSelectPlayer(usuario.id)}
                  disabled={isLoading}
                  className={clsx(
                    'w-full px-4 py-3 rounded-lg font-semibold transition-all duration-150',
                    'flex items-center justify-between text-left',
                    'border-2 text-[#F3F7F3]',
                    'touch-target',
                    isLoading && 'opacity-50 cursor-not-allowed',
                    !isLoading &&
                      'bg-[#10231D] border-[#2B4A3B] active:scale-[0.97] active:bg-[#18352A] hover:bg-[#18352A]'
                  )}
                  style={{ fontFamily: 'Inter, sans-serif', minHeight: '48px' }}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-600">{usuario.nombre}</span>
                    <span className="text-xs text-[#B7C8BD] font-normal">
                      {usuario.rol_sistema === 'jugador_registrado'
                        ? 'Jugador'
                        : usuario.rol_sistema === 'capitan'
                          ? 'Capitán'
                          : usuario.rol_sistema === 'admin'
                            ? 'Admin'
                            : 'Super Admin'}
                    </span>
                  </div>
                  {usuario.rol_sistema !== 'jugador_registrado' && (
                    <span className="text-xs bg-[#F4B942] text-[#172014] px-2 py-1 rounded font-semibold">
                      PIN
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PIN Entry Screen */}
      {authState.mode === 'pin-entry' && selectedUser && (
        <div className="w-full max-w-sm">
          {/* Back button and user info */}
          <button
            onClick={handleBackToPlayers}
            disabled={isLoading}
            className={clsx(
              'mb-6 text-[#B7C8BD] hover:text-[#F3F7F3] transition-colors',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            ← Volver
          </button>

          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-[#F3F7F3] mb-2">
              {selectedUser.nombre}
            </h2>
            {isRegisteredPlayer ? (
              <p className="text-[#B7C8BD] text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                Toca para confirmar
              </p>
            ) : (
              <p className="text-[#B7C8BD] text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                Ingresa tu PIN de 4 dígitos
              </p>
            )}
          </div>

          {/* PIN Display */}
          {!isRegisteredPlayer && (
            <div className="mb-8 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={clsx(
                    'w-14 h-14 rounded-lg border-2 flex items-center justify-center',
                    'text-2xl font-bold transition-colors duration-150',
                    authState.pin.length > i
                      ? 'bg-[#F4B942] border-[#F4B942] text-[#172014]'
                      : 'bg-[#10231D] border-[#2B4A3B] text-[#B7C8BD]'
                  )}
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  {authState.pin.length > i ? '●' : ''}
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {authState.error && (
            <div className="mb-6 flex gap-2 p-3 bg-[#E86161] bg-opacity-10 border border-[#E86161] rounded-lg">
              <AlertCircle className="w-5 h-5 text-[#E86161] flex-shrink-0 mt-0.5" />
              <p className="text-[#E86161] text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                {authState.error}
              </p>
            </div>
          )}

          {/* PIN Pad (only for non-registered players) */}
          {!isRegisteredPlayer && (
            <div className="mb-6 grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handlePinChange(String(num))}
                  disabled={isLoading || authState.pin.length >= 4}
                  className={clsx(
                    'h-14 rounded-lg font-semibold text-lg transition-all duration-150',
                    'border-2 text-[#F3F7F3]',
                    isLoading || authState.pin.length >= 4
                      ? 'opacity-50 cursor-not-allowed bg-[#10231D] border-[#2B4A3B]'
                      : 'bg-[#10231D] border-[#2B4A3B] active:scale-[0.97] active:bg-[#18352A]'
                  )}
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                  aria-label={`Dígito ${num}`}
                >
                  {num}
                </button>
              ))}

              {/* 0 button */}
              <button
                onClick={() => handlePinChange('0')}
                disabled={isLoading || authState.pin.length >= 4}
                className={clsx(
                  'h-14 rounded-lg font-semibold text-lg transition-all duration-150',
                  'border-2 text-[#F3F7F3] col-start-2',
                  isLoading || authState.pin.length >= 4
                    ? 'opacity-50 cursor-not-allowed bg-[#10231D] border-[#2B4A3B]'
                    : 'bg-[#10231D] border-[#2B4A3B] active:scale-[0.97] active:bg-[#18352A]'
                )}
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                aria-label="Dígito 0"
              >
                0
              </button>

              {/* Backspace button */}
              <button
                onClick={handlePinBackspace}
                disabled={isLoading || authState.pin.length === 0}
                className={clsx(
                  'h-14 rounded-lg font-semibold text-lg transition-all duration-150',
                  'border-2 text-[#F3F7F3]',
                  isLoading || authState.pin.length === 0
                    ? 'opacity-50 cursor-not-allowed bg-[#10231D] border-[#2B4A3B]'
                    : 'bg-[#10231D] border-[#2B4A3B] active:scale-[0.97] active:bg-[#18352A]'
                )}
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                aria-label="Eliminar"
              >
                ⌫
              </button>
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={() => handlePinSubmit()}
            disabled={
              isLoading ||
              (!isRegisteredPlayer && (authState.pin.length !== 4 || authState.isLoading))
            }
            className={clsx(
              'w-full h-12 rounded-lg font-semibold text-lg transition-all duration-150',
              'flex items-center justify-center gap-2',
              isLoading ||
                (!isRegisteredPlayer && authState.pin.length !== 4) ||
                authState.isLoading
                ? 'opacity-50 cursor-not-allowed bg-[#F4B942] text-[#172014]'
                : 'bg-[#F4B942] text-[#172014] active:scale-[0.97] hover:bg-[#F5BE5F]'
            )}
            style={{ fontFamily: 'Inter, sans-serif', minHeight: '48px' }}
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-[#172014] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                {isRegisteredPlayer ? 'Confirmar' : 'Ingresar'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="mt-16 text-center max-w-sm">
        <p className="text-xs text-[#B7C8BD]" style={{ fontFamily: 'Inter, sans-serif' }}>
          Todos los datos se sincronizan en tiempo real entre dispositivos.
        </p>
      </div>
    </div>
  );
}
