import { Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import { RealtimeStatus } from './RealtimeStatus';
import {
  LayoutDashboard,
  Users,
  GitBranch,
  Trophy,
  Wallet,
  Settings,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { signOut } from '../lib/session';
import { useNavigate } from 'react-router-dom';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    roles: ['super_admin', 'admin', 'capitan', 'jugador_registrado'],
  },
  {
    label: 'Jugadores',
    path: '/jugadores',
    icon: Users,
    roles: ['super_admin', 'admin', 'capitan', 'jugador_registrado'],
  },
  {
    label: 'Draft',
    path: '/draft',
    icon: GitBranch,
    roles: ['super_admin', 'admin', 'capitan'],
  },
  {
    label: 'Partidos',
    path: '/partidos',
    icon: Trophy,
    roles: ['super_admin', 'admin', 'capitan', 'jugador_registrado'],
  },
  {
    label: 'Cobranza',
    path: '/cobranza',
    icon: Wallet,
    roles: ['super_admin', 'admin', 'capitan'],
  },
  {
    label: 'Configuraciones',
    path: '/configuraciones',
    icon: Settings,
    roles: ['super_admin', 'admin'],
  },
];

export default function AppShell() {
  const { user, loading, demo } = useSession();
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
      toast.success('Sesión cerrada');
    } catch (error) {
      toast.error('Error al cerrar sesión');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#08120F]">
        <div className="text-[#F3F7F3] text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#2B4A3B] border-t-[#F4B942] mx-auto" />
          <p className="text-sm text-[#B7C8BD]">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Determine which navigation items the user can see based on their role
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(user.role_sistema || '')
  );

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen flex-col bg-[#08120F] text-[#F3F7F3]">
      {/* TopBar */}
      <header className="sticky top-0 z-40 border-b border-[#2B4A3B] bg-[#10231D] pt-[env(safe-area-inset-top)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Logo / App Name */}
          <div className="flex-1">
            <h1 className="font-space-grotesk text-xl font-600 text-[#F3F7F3]">
              Gestión de Pichangas
            </h1>
            {demo && (
              <p className="text-xs text-[#B7C8BD]">
                Modo demo: datos locales
              </p>
            )}
          </div>

          {/* TopBar Actions */}
          <div className="flex items-center gap-2">
            {/* Realtime Status Indicator */}
            <div className="mr-2">
              <RealtimeStatus />
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggle}
              aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="p-2 rounded-lg bg-[#18352A] hover:bg-[#2B4A3B] transition-colors active:scale-95"
            >
              {isDark ? (
                <Sun className="h-5 w-5 text-[#F4B942]" strokeWidth={2} />
              ) : (
                <Moon className="h-5 w-5 text-[#F4B942]" strokeWidth={2} />
              )}
            </button>

            {/* User Menu Dropdown */}
            <div className="relative group">
              <button
                className="px-3 py-2 rounded-lg bg-[#18352A] hover:bg-[#2B4A3B] transition-colors text-sm font-medium flex items-center gap-2 active:scale-95"
                aria-label="Menú de usuario"
              >
                <span className="truncate max-w-[120px]">{user.email}</span>
              </button>
              <div className="absolute right-0 mt-0 w-40 bg-[#18352A] border border-[#2B4A3B] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                <div className="p-2">
                  <p className="text-xs text-[#B7C8BD] px-2 py-1">
                    {user.name || 'Usuario'}
                  </p>
                  <p className="text-xs text-[#B7C8BD] px-2 pb-2 capitalize">
                    {user.role_sistema || 'Sin rol'}
                  </p>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-lg bg-[#2B4A3B] hover:bg-[#3D5E4D] text-[#E86161] font-medium transition-colors active:scale-95"
                  >
                    <LogOut className="h-4 w-4" strokeWidth={2} />
                    Cerrar sesión
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#10231D]/95 backdrop-blur border-t border-[#2B4A3B] pb-[env(safe-area-inset-bottom)]">
        <div className="flex h-14 items-center justify-around max-w-full">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <a
                key={item.path}
                href={item.path}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 px-1 font-inter text-xs font-medium transition-all active:scale-95 ${
                  active
                    ? 'text-[#F4B942]'
                    : 'text-[#B7C8BD] hover:text-[#F3F7F3]'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
                <span className="truncate max-w-full">{item.label}</span>
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
