import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session';

// Protege las rutas internas: sin sesión, lleva al inicio de sesión.
export function RequireSession({ children, redirectTo = '/login' }: { children?: ReactNode; redirectTo?: string }) {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" aria-hidden="true" />
        <span className="sr-only">Cargando…</span>
      </div>
    );
  }
  if (!user) return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  return children ? <>{children}</> : <Outlet />;
}

export default RequireSession;
