# App_Gestion_Pichangas — MVP

Gestión de eventos de fútbol (pichangas): login por nombre + PIN, dashboard
con cronómetro y contadores en vivo, y checklist de asistencia con filtros
demográficos y radar de stats por jugador.

**Alcance construido:** las 6 pestañas del spec original — Auth + Dashboard
+ Jugadores + Draft + Partidos + Cobranza + Configuraciones.

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

## Cómo funciona Partidos

1. En cuanto el Draft termina, la pestaña Partidos arma la **cola** con el
   mismo orden en que se eligieron los equipos, y crea el primer partido
   con los dos primeros de la fila.
2. El admin define la duración (minutos) y toca "Iniciar partido" — arranca
   el cronómetro y el marcador en 0-0.
3. Admin o capitán registran goles/faltas con los botones ⚽/🟨, eligiendo
   al jugador desde la lista de ambos equipos. El marcador se recalcula
   solo a partir de los eventos — si te equivocaste, el admin puede borrar
   el evento desde el timeline y el marcador se corrige automáticamente.
4. Cuando el cronómetro llega a 00:00 suena un silbato local en cada
   dispositivo (no depende de internet ni de ningún archivo de audio).
5. El admin toca "Finalizar partido": si hay un ganador claro, el
   **perdedor va al final de la cola** y el **siguiente equipo en la cola**
   entra a jugar contra el ganador (que se queda en cancha). Si hay empate,
   aparece un selector para que el admin decida manualmente quién sigue —
   no hay desempate automático, tal como pide el spec.

## Agregar y administrar usuarios desde la app

Ya no hace falta tocar Supabase para esto — todo vive en **Configuraciones**
(solo visible para admin y super_admin):

- **Agregar usuario**: nombre, edad opcional y rol. Un admin normal solo
  puede crear jugadores y capitanes; solo un **super_admin** puede crear
  otros admin o super_admin.
- **Cambiar el rol** de cualquier usuario ya existente, con la misma
  restricción de arriba.
- **Resetear PIN**: el botón que resuelve el "olvidé mi PIN" sin entrar a
  Supabase — borra el PIN guardado y la próxima vez que esa persona toque
  su nombre en el login, la app le pide crear uno nuevo.
- (En Jugadores sigue existiendo el botón rápido "+ Agregar jugador" para
  altas veloces en cancha — crea siempre con rol jugador, sin PIN.)

## Otras configuraciones

- **Tiempo global de la jornada**: el cronómetro del Dashboard. Solo se
  puede cambiar mientras la jornada está "pendiente" (antes de tocar
  "Iniciar jornada"), para no desincronizar un cronómetro que ya corre.
- **Duración por defecto del mini-partido**: se aplica a cada partido nuevo
  que arma la cola en Partidos. Se puede seguir ajustando manualmente por
  partido individual al iniciarlo, como ya hacía antes.
- **Mercado de pases**: el mismo toggle "permitir cambios post-draft" que
  ya vive en Draft, disponible acá también por conveniencia.

## Con esto están las 6 pestañas del spec original

Auth → Dashboard → Jugadores → Draft → Partidos → Cobranza → Configuraciones.
De acá en adelante son mejoras sobre lo ya construido (pulir UI, agregar
validaciones, indicadores adicionales) más que tabs nuevas — avísame qué
quieres ajustar después de probarlo en cancha.

## Correcciones de bugs

- **Partidos en bucle**: al finalizar un partido, a veces se creaba el
  siguiente usando el orden original del Draft en vez de la cola real,
  repitiendo el mismo cruce. Ahora el siguiente partido SIEMPRE lo arma
  `/api/partidos/finalizar` con la cola correcta; si la pantalla lo está
  esperando, reintenta sola cada 1.5s en vez de mostrar una pantalla muerta.
- **PIN trabado al reintentar**: si ingresabas mal el PIN, los 4 puntos se
  quedaban llenos y no dejaba tocar más números. Ahora se limpia solo en
  cuanto aparece un error, para poder reintentar de inmediato.
- **Nuevo: "Reiniciar partido" (solo pruebas)**: botón para admin en
  Partidos que vuelve el partido actual a 0-0 y borra su timeline, sin
  tocar la cola ni el draft — útil para salir de un partido a medio probar
  sin tener que completarlo.
## Corrección importante: Realtime no estaba habilitado en la base de datos

Esta era la causa raíz de que los jugadores nuevos (y en general cualquier
cambio en vivo) no aparecieran sin recargar. El código siempre estuvo bien
suscrito, pero Supabase no envía ningún aviso a menos que la tabla esté
agregada a la publicación `supabase_realtime` — es un interruptor a nivel
de base de datos, no de código, que hasta ahora nadie había activado.

`supabase/migrations/006_realtime.sql` lo activa para las 6 tablas que la
app necesita escuchar en vivo (`usuarios`, `jornadas`, `equipos_jornada`,
`asistencia_draft`, `mini_partidos`, `eventos_partido`). Además, se creó
un hook compartido (`lib/useUsuarios.ts`) que todas las pantallas usan
para la lista de usuarios, así que un jugador nuevo aparece al instante en
Jugadores, Draft, Partidos, Cobranza, Configuraciones y en el login mismo,
sin que nadie tenga que refrescar.

## Mensajes de confirmación

Al agregar un jugador (desde Jugadores o Configuraciones) o resetear un
PIN, aparece un mensaje breve tipo "✓ Jugador agregado" en la parte de
abajo de la pantalla.

## Asignar jugadores a un equipo en cualquier momento

Antes, un jugador solo podía entrar a un equipo durante el Draft (por
turnos) o, después del Draft, solo si el admin activaba "cambios
post-draft". Ahora, desde Jugadores, tocando el nombre de cualquier
jugador, admin y capitán (a su propio equipo) pueden ponerlo o quitarlo
de un equipo en cualquier momento — durante el Draft, después de
terminado, o incluso con un partido en curso. Así un jugador que llega
tarde se puede sumar a un equipo sin interrumpir nada.

## Diseño para celular: notch / Dynamic Island

Se agregó soporte de "safe area" (el margen que iOS reserva alrededor del
notch, la Dynamic Island y la barra de inicio) en toda la app: la barra
superior, el menú inferior, el login y todos los paneles que se abren
desde abajo respetan ese margen para que ningún botón quede tapado o
pegado al borde. También se agrandaron los botones más pequeños (el
check de asistencia, el toggle de pagado, los inputs numéricos) a un
tamaño cómodo para tocar con el dedo.

## Corrección importante: rutas de la API se estaban "congelando" en el build

Esto era la causa real de que resetear tu PIN a NULL no se reflejara, y
podía afectar más cosas de forma silenciosa. Next.js, por defecto, puede
detectar que una ruta de API "no depende de nada dinámico" y la convierte
en estática: la ejecuta UNA vez durante el build en Vercel y sirve esa
misma respuesta congelada a todo el mundo después, sin volver a consultar
Supabase — no es un problema de conexión, es una optimización de Next.js
que en este caso jugaba en contra.

Ahora **todas** las rutas de `/api/*` tienen `export const dynamic =
"force-dynamic"`, que le dice a Next.js "esta ruta siempre se ejecuta
fresca, nunca la guardes". Lo puedes confirmar vos mismo: en la salida de
`npm run build`, cada ruta bajo `/api/` debe aparecer marcada con `ƒ`
(Dynamic) — si alguna vez ves una marcada `○` (Static), avísame.

## Corrección: "Finalizar jornada" no se quedaba finalizada

Dos problemas juntos causaban esto:

1. El botón fallaba en silencio si la petición no se completaba bien — ya
   no: ahora muestra un mensaje de error abajo si algo sale mal, y
   confirma el cambio contra la base de datos (no solo contra la
   respuesta del click) antes de darlo por hecho.
2. **La causa de fondo**: apenas una jornada quedaba "finalizada",
   `/api/jornada/active` creaba automáticamente una jornada NUEVA en
   blanco la siguiente vez que cualquier pantalla la consultaba — así que
   Cobranza, Draft, etc. "perdían" la jornada que acababas de cerrar y
   parecía que nunca se había finalizado. Ahora eso ya no pasa solo: la
   app se queda mostrando la jornada finalizada (con Cobranza ya
   desbloqueada) hasta que el admin toca el nuevo botón **"Comenzar
   jornada nueva"** en el Dashboard. Recién ahí se crea una jornada en
   blanco de verdad.

También se agregó un mensaje "🎉 ¡Gracias! Todos pagaron" en Cobranza que
aparece solo cuando todos los jugadores con equipo asignado marcaron
"Pagó".

## Reglas de asistencia, draft y qué se conserva

- **Cada "Nueva jornada" arranca en cero**: equipos, draft, cobranza y
  partidos del día — todo nuevo. Lo único que persiste siempre son los
  **usuarios** (jugadores) y el **historial de partidos** finalizados
  (por fecha y hora), visible al final de la pestaña Partidos.
- **Draft muestra en vivo quién falta**: en la pantalla de configuración
  del draft aparece "Faltan N: nombre, nombre…" con los que aún no
  marcaste presentes, actualizado al instante.
- **Asistencia bloqueada una vez en el draft**: puedes desmarcar "presente"
  libremente (por si te equivocaste) mientras esa persona no esté en
  ningún equipo. En cuanto el draft la asigna a un equipo, el botón se
  bloquea (🔒) — hay que sacarla del equipo primero (desde el detalle del
  jugador) si de verdad hay que corregirlo.

## Corrección permanente: la app se "congelaba" o los bugs viejos volvían

Si después de instalar una actualización seguías viendo un bug que ya
habíamos corregido (el PIN, pantallas que no se actualizan), la causa más
probable no era el código: era que tu celular tenía **guardada en caché
una versión vieja** de la app, así que seguía corriendo el JavaScript de
antes aunque el servidor ya tuviera el arreglo.

Esto ya no debería volver a pasar — `next.config.mjs` ahora fuerza:
- Cero caché de navegación dentro de la app (`staleTimes` en 0): cada vez
  que cambias de pestaña, se vuelve a pedir todo fresco, nunca se queda
  con una foto vieja.
- `Cache-Control: no-store` en todas las respuestas, para que ni el
  navegador ni Vercel guarden nada.

**Un solo paso manual, una sola vez**, para limpiar lo que tu iPhone ya
tenía guardado de antes de este fix: en el iPhone, ve a Ajustes → Safari
→ "Borrar historial y datos de sitios web" (o, más simple, abre la app en
una pestaña de Navegación Privada para probar). Después de eso, con este
fix instalado, no debería volver a necesitarse.

## Corrección definitiva: la lista de jugadores no se actualizaba

La causa real: de todos los datos de la app (equipos, asistencia,
partidos, cobranza), la lista de **usuarios** era la única que pasaba por
una ruta intermedia de Next.js (`/api/usuarios`) en vez de leerse directo
de Supabase desde el navegador — y esa capa de más es la que venía dando
problemas de caché una y otra vez, sin importar cuántos `no-store` le
pusiéramos.

Ahora `lib/useUsuarios.ts` lee **directo de Supabase**, exactamente igual
que Draft, Partidos, Cobranza y asistencia (que nunca tuvieron este
problema). Ya no depende de ninguna ruta de Next.js ni de configuración de
caché — un jugador nuevo aparece al toque, en cualquier pantalla, porque
usa el mismo camino que ya sabíamos que funciona bien.

## Correcciones: capitanes, permisos del draft, y el "reinicio" fantasma

- **Capitán no veía Draft**: al elegir capitanes en Jugadores, ahora
  también se les sube el rol a `capitan` en el sistema (antes solo se
  anotaba en el equipo, sin tocar su rol). La próxima vez que ese jugador
  entra, ya ve Draft, Partidos y Cobranza. Nunca degrada a alguien que ya
  era admin/super_admin.
- **El admin ya no puede elegir en el draft**: durante el draft en curso,
  solo puede elegir el capitán del equipo en turno (el super_admin
  conserva un permiso de respaldo por si hay que destrabar algo). El
  admin normal participa en el setup (cupos, iniciar draft) y en activar
  el mercado de pases al final — no en las elecciones en sí.
- **"El draft se reinicia" al agregar un jugador**: la causa real era que,
  si dos pantallas consultaban al mismo tiempo cuando todavía no existía
  ninguna jornada, cada una podía crear la suya — dejando dos jornadas
  "activas" en la base de datos. La pantalla que terminaba mostrando la
  jornada vieja (recién creada, sin draft) parecía haberse reiniciado.
  `supabase/migrations/007_una_jornada_activa.sql` limpia cualquier
  duplicado que haya quedado (conservando la que tiene el draft real) y
  agrega un candado a nivel de base de datos para que nunca puedan existir
  dos jornadas activas a la vez.
