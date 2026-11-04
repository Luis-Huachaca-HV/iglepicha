import { useEffect, useState, useRef } from 'react';
import { AlertCircle, CheckCircle2, Wifi, WifiOff, RotateCw } from 'lucide-react';
import { clsx } from 'clsx';

type StatusType = 'connected' | 'disconnected' | 'retrying' | 'device-reset' | 'recovering';

interface RealtimeStatusProps {
  /**
   * Clase opcional para contenedor personalizado
   */
  className?: string;
  /**
   * Mostrar siempre o solo cuando hay un estado no ideal
   */
  alwaysVisible?: boolean;
}

/**
 * RealtimeStatus — Indicador reutilizable de sincronización en tiempo real.
 * 
 * Muestra:
 * - Conectado: ícono de Wi-Fi (silencioso)
 * - Desconectado: alerta visual + reintentos automáticos cada 3s
 * - Reintentando: indicador de carga
 * - Jornada reiniciada desde otro dispositivo: notificación destacada
 * - Recuperándose al volver a primer plano: estado transitorio
 * 
 * Se integra con visibilitychange, focus, pageshow (bfcache) y consultas periódicas
 * al backend para verificar el estado de la jornada actual.
 */
export function RealtimeStatus({
  className,
  alwaysVisible = false,
}: RealtimeStatusProps) {
  const [status, setStatus] = useState<StatusType>('connected');
  const [showMessage, setShowMessage] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastJornadaIdRef = useRef<string | null>(null);

  // Limpiar timeouts e intervalos
  const cleanup = () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Verificar conectividad con el servidor (sondeo de respaldo)
  const checkConnectivity = async () => {
    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  // Verificar si la jornada fue reiniciada desde otro dispositivo
  const checkForJornadaReset = async () => {
    try {
      const response = await fetch('/api/jornada/active', {
        method: 'GET',
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.jornada?.id || null;
    } catch {
      return null;
    }
  };

  // Transición a estado conectado con reinicio de contador
  const goConnected = () => {
    setStatus('connected');
    setShowMessage(false);
    setRetryCount(0);
    cleanup();
  };

  // Transición a desconectado e iniciar reintentos automáticos
  const goDisconnected = () => {
    setStatus('disconnected');
    setShowMessage(true);
    setRetryCount(0);
    cleanup();

    // Reintentos cada 3 segundos
    const attemptRetry = async () => {
      setStatus('retrying');
      const isConnected = await checkConnectivity();

      if (isConnected) {
        goConnected();
      } else {
        setRetryCount((prev) => prev + 1);
        setStatus('disconnected');

        retryTimeoutRef.current = setTimeout(attemptRetry, 3000);
      }
    };

    retryTimeoutRef.current = setTimeout(attemptRetry, 3000);
  };

  // Transición a recuperación (volver a primer plano)
  const goRecovering = async () => {
    setStatus('recovering');
    setShowMessage(true);

    // Verificar conectividad y estado de jornada
    const isConnected = await checkConnectivity();
    if (!isConnected) {
      goDisconnected();
      return;
    }

    const currentJornadaId = await checkForJornadaReset();

    // Detectar reinicio de jornada desde otro dispositivo
    if (
      lastJornadaIdRef.current !== null &&
      lastJornadaIdRef.current !== currentJornadaId
    ) {
      setStatus('device-reset');
      setShowMessage(true);
      // La notificación se mantiene visible para que el usuario la vea
      retryTimeoutRef.current = setTimeout(() => {
        lastJornadaIdRef.current = currentJornadaId;
        goConnected();
      }, 5000);
    } else {
      lastJornadaIdRef.current = currentJornadaId;
      goConnected();
    }
  };

  // Configurar listeners de visibilidad y focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Pausar sondeo cuando la pestaña se oculta
        cleanup();
      } else {
        // Recuperarse cuando la pestaña vuelve a primer plano
        goRecovering();
      }
    };

    const handleFocus = () => {
      goRecovering();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      // Manejar bfcache de Safari
      if (event.persisted) {
        goRecovering();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // Sondeo periódico (cada 5s) cuando está conectado y visible
  useEffect(() => {
    if (status === 'connected' && !document.hidden) {
      pollIntervalRef.current = setInterval(async () => {
        const isConnected = await checkConnectivity();
        if (!isConnected) {
          goDisconnected();
        } else {
          const currentJornadaId = await checkForJornadaReset();
          if (
            lastJornadaIdRef.current !== null &&
            lastJornadaIdRef.current !== currentJornadaId
          ) {
            setStatus('device-reset');
            setShowMessage(true);
            lastJornadaIdRef.current = currentJornadaId;
            retryTimeoutRef.current = setTimeout(() => {
              goConnected();
            }, 5000);
          } else {
            lastJornadaIdRef.current = currentJornadaId;
          }
        }
      }, 5000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [status]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  // No mostrar si estamos conectados y alwaysVisible es falso
  if (status === 'connected' && !alwaysVisible) {
    return null;
  }

  const getIndicator = () => {
    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          bgColor: 'bg-[#10231D]',
          borderColor: 'border-[#2B4A3B]',
          textColor: 'text-[#B7C8BD]',
          label: 'Sincronizado',
          ariaLabel: 'Conectado al servidor',
        };

      case 'disconnected':
        return {
          icon: WifiOff,
          bgColor: 'bg-[#10231D]',
          borderColor: 'border-[#E86161]',
          textColor: 'text-[#E86161]',
          label: `Sin conexión (reintentando en ${3 - (retryCount % 3)}s)`,
          ariaLabel: 'Sin conexión, reintentando',
        };

      case 'retrying':
        return {
          icon: RotateCw,
          bgColor: 'bg-[#10231D]',
          borderColor: 'border-[#F4B942]',
          textColor: 'text-[#F4B942]',
          label: 'Reintentando conexión…',
          ariaLabel: 'Reintentando conexión',
          isAnimating: true,
        };

      case 'device-reset':
        return {
          icon: AlertCircle,
          bgColor: 'bg-[#18352A]',
          borderColor: 'border-[#43C47A]',
          textColor: 'text-[#43C47A]',
          label: 'Jornada reiniciada desde otro dispositivo',
          ariaLabel: 'Jornada reiniciada',
        };

      case 'recovering':
        return {
          icon: RotateCw,
          bgColor: 'bg-[#10231D]',
          borderColor: 'border-[#F4B942]',
          textColor: 'text-[#F4B942]',
          label: 'Recuperando sincronización…',
          ariaLabel: 'Recuperando conexión',
          isAnimating: true,
        };

      default:
        return {
          icon: Wifi,
          bgColor: 'bg-[#10231D]',
          borderColor: 'border-[#2B4A3B]',
          textColor: 'text-[#B7C8BD]',
          label: '',
          ariaLabel: '',
        };
    }
  };

  const indicator = getIndicator();
  const Icon = indicator.icon;

  // Mostrar mensaje solo cuando showMessage es verdadero
  if (!showMessage && status === 'connected') {
    return null;
  }

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-4 py-3 rounded-lg border',
        indicator.bgColor,
        indicator.borderColor,
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={indicator.ariaLabel}
    >
      <Icon
        size={16}
        strokeWidth={2}
        className={clsx(
          indicator.textColor,
          indicator.isAnimating && 'animate-spin',
        )}
        aria-hidden="true"
      />
      <span
        className={clsx(
          'text-sm font-500 leading-tight',
          indicator.textColor,
        )}
      >
        {indicator.label}
      </span>
    </div>
  );
}
