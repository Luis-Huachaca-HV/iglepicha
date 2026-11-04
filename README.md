# Gestión de Pichangas

## Descripción

Tengo este archivo md de un proyecto que he creado, para que analices el contexto, asi mismo puedo enviarte el repositorio de github o como podrias verlo para conectarlo?# App_Gestion_Pichangas — Contexto completo (v2) Documento para retomar el proyecto en cualquier conversación nueva con Claude.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS · PWA

## Estructura

- `/src/App.tsx` — punto de entrada
- `/src/components/AppShell.tsx` — Shell móvil con safe-area, TopBar, navegación inferior por rol, estado de conexión y contenedor de las pantallas privadas.
- `/src/components/LoginScreen.tsx` — Inicio de sesión propio con selección de jugador y PIN de cuatro dígitos según el rol.
- `/src/components/DashboardScreen.tsx` — Resumen de la jornada actual con cronómetro, presentes, equipos, creador, estado y acciones administrativas de inicio, finalización y nueva jornada.
- `/src/components/PlayersScreen.tsx` — Gestión de jugadores, asistencia confirmada, filtros por edad, alta rápida, capitanes, posición, valoración y asignación de equipos.
- `/src/components/DraftScreen.tsx` — Draft por turnos donde solo el capitán correspondiente o el super_admin puede elegir jugadores elegibles con asistencia.
- `/src/components/MatchesScreen.tsx` — Cola de partidos, cronómetro, silbato accesible, marcador editable por eventos, reinicio de prueba e historial por fecha y hora.
- `/src/components/PaymentsScreen.tsx` — Cobranza en dos niveles: jugadores pagan a su capitán y capitanes entregan el total al admin, con confirmaciones irreversibles.
- `/src/components/SettingsScreen.tsx` — Configuración administrativa de usuarios, roles, PIN, duración, mercado de pases y reinicio total protegido por confirmación escrita.
- `/src/components/RatingRadar.tsx` — Widget reutilizable para mostrar los nueve atributos de valoración de un jugador mediante radar y resumen numérico.
- `/src/components/RealtimeStatus.tsx` — Indicador reutilizable de sincronización, reintentos, jornada reiniciada desde otro dispositivo y recuperación al volver a primer plano.
- `/src/components/ConfirmActionDialog.tsx` — Diálogo accesible para asistencia, pagos irreversibles, finalización y escribir REINICIAR antes del borrado de la jornada actual.

## Instalación

```bash
npm install
npm run dev    # desarrollo (Vite)
npm run build  # build de producción → dist/
```

## Variables de entorno

Copia `.env.example` a `.env.local` y completa:

- `VITE_SUPABASE_URL` — URL de tu proyecto Supabase (Settings → API).
- `VITE_SUPABASE_ANON_KEY` — anon/publishable key del mismo proyecto.

Las variables `VITE_*` son públicas en el navegador: **nunca** pongas la `service_role` ni otros secretos aquí.

## Conexión Supabase (manual)

1. Crea (o reutiliza) un proyecto en [supabase.com](https://supabase.com) y copia URL + anon key a `.env.local`.
2. Aplica los SQL de `/supabase/migrations` en orden (SQL Editor del dashboard, o `supabase db push` con la CLI).
3. Si el repo trae `/supabase/functions`, publícalas con `supabase functions deploy <nombre>` (CLI logueada en tu proyecto).
4. Configura los secrets que cada function lea con `Deno.env.get(...)` en Dashboard → Edge Functions → Secrets.

## Deploy en Vercel

1. Importa el repositorio en [vercel.com](https://vercel.com) (framework: Vite).
2. Build command `npm run build`, output `dist/`.
3. Carga las variables `VITE_*` de `.env.example` en Settings → Environment Variables.
4. En Supabase → Auth → URL Configuration agrega el dominio de Vercel a los redirects si tu app usa login.

## Integración continua

El workflow `.github/workflows/cosmos-build.yml` valida el build en cada push y, si falta `package-lock.json`, lo genera y propone un PR con el lockfile.

## Navegación

SPA con React Router y fallback de navegación para publicación.

---

_Generado con Cosmos Code_
