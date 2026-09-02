# App_Gestion_Pichangas — MVP

Gestión de eventos de fútbol (pichangas): login por nombre + PIN, dashboard
con cronómetro y contadores en vivo, y checklist de asistencia con filtros
demográficos y radar de stats por jugador.

**Alcance construido hasta ahora:** Auth + Dashboard + Jugadores + Draft.
Partidos, Cobranza y Configuraciones quedan como siguiente fase (el schema
de Supabase ya incluye las tablas necesarias para no tener que migrar de
nuevo).

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase (Postgres + Realtime) — sin Supabase Auth, login custom por PIN
- Pensado para deploy en Vercel

## 1. Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → **New project**. Elige nombre,
   contraseña de base de datos y región (elige la más cercana a Perú, p.ej.
   `sa-east-1`).
2. Cuando el proyecto esté listo, entra a **SQL Editor** → **New query**,
   pega todo el contenido de `supabase/schema.sql` y ejecútalo (▶ Run).
   Esto crea todas las tablas, tipos y políticas de seguridad (RLS).

   > **¿Ya habías corrido `schema.sql` antes (versión sin Draft)?** No lo
   > vuelvas a correr — en vez de eso corre solo
   > `supabase/migrations/002_draft.sql`, que agrega las columnas nuevas
   > sin tocar lo que ya tenías.
3. Ve a **Project Settings → API** y copia:
   - `Project URL` → será `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → será `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (sección "Project API keys", **secreta**) →
     será `SUPABASE_SERVICE_ROLE_KEY`

## 2. Crear tus primeros usuarios

Por ahora (fase MVP) los usuarios se crean directo en Supabase — la pantalla
de administración (tab Configuraciones) es la siguiente fase. En **Table
Editor → usuarios**, inserta filas con:

| nombre | edad | rol_sistema | pin_hash |
|---|---|---|---|
| Axl | 30 | super_admin | *(dejar vacío)* |
| Un jugador cualquiera | 24 | jugador_registrado | *(dejar vacío)* |

Deja `pin_hash` vacío: la app te pedirá crear tu PIN la primera vez que
entres (para los roles `super_admin`, `admin` y `capitan`). Los
`jugador_registrado` entran solo tocando su nombre, sin PIN.

## 3. Configurar variables de entorno localmente

```bash
cp .env.local.example .env.local
```

Completa los tres valores de Supabase del paso 1, y agrega un cuarto:

```
SESSION_SECRET=algo-largo-y-aleatorio
```

(puedes generarlo con `openssl rand -hex 32`). Se usa para firmar la cookie
de sesión — sin esto cualquiera podría falsificarla.

## 4. Correr en local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## 5. Subir a GitHub y desplegar en Vercel

```bash
git init
git add .
git commit -m "MVP: auth, dashboard, jugadores"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/pichangas-app.git
git push -u origin main
```

Luego en [vercel.com](https://vercel.com):
1. **Add New → Project** → importa el repo de GitHub.
2. En **Environment Variables**, agrega las 4 variables de `.env.local`
   (las 3 de Supabase + `SESSION_SECRET`).
3. Deploy. Cada push a `main` vuelve a desplegar automáticamente (mismo
   patrón que usas en tus otros proyectos).

## Nota de seguridad (léela antes de usar esto con plata real)

Este MVP resuelve el login con un hash de PIN + cookie firmada — suficiente
para probar con tu grupo de pichanga, pero antes de que la Cobranza (pagos)
dependa de esto conviene:
- Limitar intentos de PIN (actualmente no hay rate-limiting).
- Rotar `SESSION_SECRET` y usar `httpOnly` + `secure` cookies en producción
  (ya está `secure` activado automáticamente cuando `NODE_ENV=production`,
  que Vercel setea solo).
- Revisar los permisos de cada API route a medida que se agreguen Draft,
  Partidos y Cobranza (Cobranza en particular debe quedar bloqueada
  durante el juego, como pide el spec original).

## Cómo funciona el Draft

1. En Jugadores, el admin elige capitanes → se crean los `equipos_jornada`.
2. En Draft, con el estado "no iniciado", el admin define el **cupo máximo**
   de cada equipo y toca "Iniciar draft". Esto fija el orden de turno (por
   orden de creación de equipo) y asigna a cada capitán a su propio equipo.
3. En cada turno, **solo el capitán del equipo en turno (o un admin)** puede
   tocar un jugador de la bolsa. Aparece un pop-up de confirmación; al
   confirmar, el jugador queda bloqueado a ese equipo y el turno avanza al
   siguiente equipo con cupo disponible (salta a los que ya se llenaron).
4. El promedio de rating por equipo se recalcula en vivo (excluye jugadores
   "S/C" sin votos, para no ensuciar el promedio).
5. Cuando se llenan todos los cupos o se vacía la bolsa, el draft se marca
   "finalizado". Ahí el admin puede activar **"Permitir cambios
   post-draft"**: con eso encendido, tocar el nombre de un jugador en su
   equipo abre un selector para moverlo a otro equipo o devolverlo a la
   bolsa.

## Qué sigue

- **Partidos**: cronómetro de mini-partido, marcador en vivo, timeline de
  eventos editable, cola de "el que gana se queda". Usa los equipos y
  rosters que deja armados el Draft.
- **Cobranza**: cálculo de cuota por equipo/jugador, toggle pagado/no
  pagado, bloqueada mientras la jornada está en curso.
- **Configuraciones**: alta de usuarios y PINs desde la propia app (hoy se
  hace por SQL Editor), tiempo global/mini-partido configurable, tiempo
  máximo de cupo por equipo por defecto.
