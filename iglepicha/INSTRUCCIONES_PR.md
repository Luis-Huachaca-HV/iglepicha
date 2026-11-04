# Camotes y tope de jugadores top — guía para fusionar el PR

Rama: `cosmos-code/camote-y-tope-top` → `main` del repositorio `iglepicha`.

> **Importante:** el commit sube los archivos con el prefijo `iglepicha/` (y junto a la copia Vite de Cosmos: `/src`, `package.json`…). **No fusiones el PR tal cual.** Copia cada archivo de `iglepicha/...` a su destino real desde la web de GitHub («Files changed» → abrir el archivo → copiar → editar el destino en `main` → pegar → commit). Ignora todo lo que esté fuera de `iglepicha/`.

---

## 1. Orden de aplicación

1. **Primero el SQL 013** en Supabase → SQL Editor → New query → pegar `iglepicha/supabase/migrations/013_camote_y_tope_top.sql` → Run.
   Mientras no corra, nada se rompe (no hay Camotes y el umbral es 7.5), pero el botón "Camote" responderá con el aviso *"La función Camote todavía no está habilitada en la base de datos (migración 013)."*
2. Copiar los archivos de la tabla de abajo a su destino.
3. Pegar los fragmentos de la sección 3 en `components/DraftClient.tsx` y `components/JugadoresClient.tsx`.
4. Deploy (Vercel lo hace solo al hacer commit en `main`).

---

## 2. Mapa de archivos

| Archivo en la rama | Destino en el repo | Acción |
|---|---|---|
| `iglepicha/supabase/migrations/013_camote_y_tope_top.sql` | `supabase/migrations/013_camote_y_tope_top.sql` | nuevo (y ejecutar en SQL Editor) |
| `iglepicha/lib/draft-reglas.ts` | `lib/draft-reglas.ts` | nuevo |
| `iglepicha/lib/draft-asignar.ts` | `lib/draft-asignar.ts` | reemplaza |
| `iglepicha/lib/types.ts` | `lib/types.ts` | reemplaza |
| `iglepicha/app/api/draft/elegir/route.ts` | `app/api/draft/elegir/route.ts` | reemplaza |
| `iglepicha/app/api/draft/trade/route.ts` | `app/api/draft/trade/route.ts` | reemplaza |
| `iglepicha/app/api/usuarios/route.ts` | `app/api/usuarios/route.ts` | reemplaza |
| `iglepicha/app/api/usuarios/camote/route.ts` | `app/api/usuarios/camote/route.ts` | nuevo |
| `iglepicha/app/api/cobranza/costo/route.ts` | `app/api/cobranza/costo/route.ts` | reemplaza |
| `iglepicha/components/CamoteToggle.tsx` | `components/CamoteToggle.tsx` | nuevo |
| `iglepicha/components/CobranzaClient.tsx` | `components/CobranzaClient.tsx` | reemplaza |

---

## 3. Fragmentos para las dos pantallas grandes

No pude leer estos dos archivos completos, así que te dejo las inserciones exactas. Los nombres de variables (`sesion`, `usuarios`, `asistencias`, `usuariosMap`, `toast`/`setError`, `recargar`) pueden variar un poco en tu código: adáptalos al nombre que ya uses.

### 3.1 `components/DraftClient.tsx`

**a) Mostrar el motivo del 409 (tope de tops) al elegir o intercambiar**

Busca donde haces `fetch("/api/draft/elegir", …)` (y lo mismo para `fetch("/api/draft/trade", …)`). Después de leer la respuesta, asegúrate de que el error del servidor llegue a pantalla:

```ts
const res = await fetch("/api/draft/elegir", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  cache: "no-store",
  body: JSON.stringify({ id_jornada: jornada.id_jornada, id_equipo: idEquipo, id_usuario: idUsuario }),
});
const data = await res.json().catch(() => ({}));

if (!res.ok) {
  // 409 con tope de tops: "Este equipo ya tiene 1 jugador top…"
  // Usa el toast/estado de error que ya tenga la pantalla.
  mostrarError(data.error ?? "No se pudo completar la elección");
  if (data.jornadaInvalida) recargarJornada();
  return;
}
```

Si la pantalla no tiene un `mostrarError`, el mínimo es un estado:

```tsx
const [aviso, setAviso] = useState<string | null>(null);
// ...
{aviso && (
  <p role="alert" className="rounded border border-card-red/50 bg-pitch-900 px-3 py-2 text-sm text-card-red">
    {aviso}
  </p>
)}
```

**b) Aviso cuando el cierre del draft deja Camotes sin equipo**

En la misma respuesta de `/api/draft/elegir` (justo después del bloque anterior), la ruta devuelve `camotes_sin_equipo: string[]` (ids de usuario) cuando el draft se cierra:

```ts
const sinEquipo: string[] = data.camotes_sin_equipo ?? [];
if (sinEquipo.length > 0) {
  const nombres = sinEquipo.map((id) => usuariosMap[id]?.nombre ?? "un Camote").join(", ");
  mostrarAviso(`Hay más Camotes que equipos: ${nombres} quedó sin equipo, asígnalo a mano.`);
}
```

Si el sorteo completo también se dispara desde esta pantalla (ruta que llama a `recalcularEquiposJornada`), esa función ahora devuelve `{ camotesSinEquipo }`: si tu ruta lo reenvía como `camotes_sin_equipo`, aplica el mismo bloque.

**c) Filtrar Camotes de la bolsa visible**

Donde calculas la lista de jugadores disponibles (presentes sin equipo), excluye a los Camotes (misma regla que el servidor: `es_camote` y edad < 12):

```ts
const EDAD_MAX_CAMOTE = 12;

function esCamote(idUsuario: string) {
  const u = usuariosMap[idUsuario];
  return !!u && u.es_camote === true && u.edad != null && u.edad < EDAD_MAX_CAMOTE;
}

const bolsa = asistencias.filter((a) => a.presente && !a.id_equipo && !esCamote(a.id_usuario));
```

Opcional, para que el admin vea a los Camotes que esperan reparto:

```tsx
const camotesEnEspera = asistencias.filter((a) => a.presente && !a.id_equipo && esCamote(a.id_usuario));
{camotesEnEspera.length > 0 && (
  <p className="text-xs text-mist">
    Camotes (se reparten solos al cerrar el draft): {camotesEnEspera.map((a) => usuariosMap[a.id_usuario]?.nombre ?? "?").join(", ")}
  </p>
)}
```

> `usuariosMap[id].es_camote` llega porque `GET /api/usuarios` ya lo devuelve (archivo `app/api/usuarios/route.ts` de esta rama).

### 3.2 `components/JugadoresClient.tsx`

**a) Importar el botón**

```ts
import { CamoteToggle } from "@/components/CamoteToggle";
```

**b) Renderizarlo en cada fila de jugador**

El componente se oculta solo si el jugador tiene 12 o más años o si quien mira no es admin/super_admin, así que puedes ponerlo en todas las filas sin condicionar:

```tsx
<CamoteToggle
  idUsuario={u.id_usuario}
  edad={u.edad}
  esCamote={u.es_camote === true}
  rolActual={sesion.rol_sistema}
  onChange={() => recargar()}
  onError={(mensaje) => mostrarError(mensaje)}
/>
```

- `u` es el usuario de la fila (`Usuario` de `lib/types.ts`, ya con `es_camote?`).
- `sesion` es la `SesionUsuario` que recibe la pantalla.
- `recargar` es la función que vuelve a pedir `GET /api/usuarios` (o el `reload` de `useUsuarios`). Si no la tienes a mano, `onChange` puede actualizar el estado local: `onChange={(valor) => setUsuarios((prev) => prev.map((x) => x.id_usuario === u.id_usuario ? { ...x, es_camote: valor } : x))}`.
- `onError` es opcional: el botón ya muestra el error debajo de sí mismo.

Si la fila es un `flex` horizontal con el nombre y la posición, coloca el botón al final con `className="ml-auto"`.

---

## 4. Qué comprobar después de fusionar

- [ ] Con 5 tops y 5 equipos, el segundo top al mismo equipo devuelve 409 y el mensaje aparece en el draft.
- [ ] El mismo bloqueo ocurre al mover un top con intercambio post-draft.
- [ ] Un jugador con `es_camote = true` y edad < 12 no aparece en la bolsa y, al cerrar el draft, queda en un equipo (uno por equipo).
- [ ] Con más Camotes que equipos aparece el aviso "Hay más Camotes que equipos: … quedó sin equipo, asígnalo a mano".
- [ ] En Cobranza, cuota por persona = costo / presentes no Camote; el Camote muestra "Camote · no paga".
- [ ] Marcar Camote a alguien de 12 o más devuelve 400 ("Solo se puede marcar Camote a menores de 12 años").

## 5. Supuestos aplicados

- Tope automático = `ceil(tops presentes / equipos)`, mínimo 1; manual con `jornadas.max_tops_por_equipo`.
- "Top" = promedio general ≥ `jornadas.umbral_top` (7.5 por defecto). El capitán cuenta como top de su equipo si supera el umbral.
- Un Camote por equipo; va al equipo con menos jugadores y, en empate, al de mejor promedio. El sobrante queda con `id_equipo = null` y `presente = true`; el admin lo recoloca con intercambio (sin bloqueo para Camotes).
- El Camote no paga cuota ni cuenta en el cupo; si marcó ticket, solo se le cobra el ticket.
