// Rutas de la app, generadas por Cosmos a partir del plan. Cada pantalla vive en su propio archivo.
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import RequireSession from './components/RequireSession';
import LoginScreen from './components/LoginScreen';
import DashboardScreen from './components/DashboardScreen';
import PlayersScreen from './components/PlayersScreen';
import DraftScreen from './components/DraftScreen';
import MatchesScreen from './components/MatchesScreen';
import PaymentsScreen from './components/PaymentsScreen';
import SettingsScreen from './components/SettingsScreen';
import AppShell from './components/AppShell';
import PushGuideScreen from './components/PushGuideScreen';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/como-hacer-push" element={<PushGuideScreen />} />
        <Route element={<RequireSession redirectTo="/login" />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardScreen />} />
            <Route path="/jugadores" element={<PlayersScreen />} />
            <Route path="/draft" element={<DraftScreen />} />
            <Route path="/partidos" element={<MatchesScreen />} />
            <Route path="/cobranza" element={<PaymentsScreen />} />
            <Route path="/configuraciones" element={<SettingsScreen />} />
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
