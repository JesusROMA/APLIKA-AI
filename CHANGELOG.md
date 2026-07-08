# Changelog

## Profesionalización de la landing — 2026-07-07

Refactor integral de `public/dc/Aplika.ai.dc.html` en 3 fases: auditoría (AUDIT.md, commit `35ab577`), refactor por sección al contrato de diseño (commit `46d46de`) y verificación final (esta fase). Cifras del refactor: **88.5 KB → 77.9 KB** (−10.6 KB, −12 %), **+316/−196 líneas**. Framework de plantillas dc intacto: 58 bindings `{{ }}` antes y después, `sc-for`/`sc-if`/`dc-import` sin cambios, lógica de scrub (`setStory`) intocada.

### Eliminado

- **Bloque "Tu negocio, digitalizado." del acto 1 de la Historia**: entrada `{ id: 'marca' }` de `storyPhrases` (JS), todo el CSS de `.story-ph.lead-main` (tipografía display, `::before` con gradiente, stagger de hijos, variantes `.lead-on` y `.story-reduced`) y su HTML. El hero de la historia abre ahora solo con video + DESLIZA; `hint-placeholder-count` pasó de 5 a 4, alineado con los 4 actos restantes.
- **Código muerto verificado en la auditoría**: `@keyframes spin` (única regla CSS sin consumidores en todo `public/dc/` y `src/`) y el binding muerto `steps: this.steps` de `renderVals` (la plantilla usa `{{ flowSteps }}`; el array `this.steps` sigue vivo).
- **DESLIZA duplicado del Hero**: el segundo indicador (bounceY 1.8 s / 0.18em / rgba .5) se fusionó con el de la Historia en un único componente `.scroll-hint`.
- **~9 atributos `style-hover` duplicados** absorbidos por los `:hover` de las clases del contrato (`.btn--primary/--ghost/--navy`, `.link-more`, `.ind-card`, `.slider-btn`). Solo queda el del botón WhatsApp (intencional, usa `--whatsapp-hover`).
- **3 `transition:all .2s`** (tabs de Plataforma, tarjetas de Industrias, dots de Testimonios) sustituidas por transiciones de propiedades explícitas con `--dur-fast`/`--ease`.
- **Estilos inline repetidos colapsados en clases**: 4 shells idénticos de tarjeta demo (`.demo-card`), ~15 barras skeleton (`.sk-bar`/`.sk-product`), 3 filas de inventario (`.inv-row`), 7 barras de gráfico (`.bar`), 5 KPIs (`.kpi`), 2 tarjetas flotantes (`.float-card`), 2 badges oscuros (`.badge-dark`), 2 botones del slider (`.slider-btn`), la píldora del marquee duplicada por el track `aria-hidden` (`.mq-pill`, ~240 caracteres ×2) y 8 copias del contenedor de sección (`.u-wrap`/`.sec`).
- **`max-width` en px de los leads** (520/480/460 px) sustituidos por el `52ch` de `.lead-sec`.
- **Fase 3**: tokens ad-hoc `--w-60` y `--track-hint` (creados fuera del contrato para el DESLIZA) eliminados del `:root`; `.scroll-hint` alineado a los tokens del contrato.

### Homologado

- **Contrato de diseño en `:root` (~60 tokens)** derivado solo de valores existentes: paleta (18 hex + escalas rgba `--w-*`/`--ink-*` y familia oscura `--dark`), tipografía (11 escalas, clamps consolidados), espaciado base 8 px (`--sp-1..12`, `--sec-y/--sec-y-lg/--sec-x`), radios (`--r-xs..xl/full`), 4 sombras, timing (`--ease`, `--ease-spring`, 4 duraciones) y layout (`--container:1180px`, `--container-narrow:880px`). Más **40 clases utilitarias** (`.u-wrap`, `.sec`, `.h2-sec`, `.lead-sec`, `.eyebrow`, `.btn--*`, `.demo-card`, `.kpi`, `.bar`, `.sk-*`, `.inv-row`, `.float-card`, `.badge-dark`, `.pill--*`, `.icon-tile`, `.scroll-hint`, `.dotted-navy`, `.mq-pill`, `.ind-card`, `.card-title/.card-body`, `.slider-btn`, `.link-more`…).
- **Títulos**: los 5 clamps distintos de H2 de sección → 1 solo (`--fs-h2: clamp(26px,3.4vw,40px)`); jerarquía por rol (`--fs-h1` hero, `--fs-title` CTA/Historia/Stats, `--fs-h3` subtítulos/quote). Un solo `<h1>` en la página (Hero) y `text-wrap:balance` en titulares.
- **Tipografía menor**: sub-escala de medios píxeles eliminada (13.5/14.5/15.5/16.5 → 14/15/16); line-heights 1.5/1.6 → `--lh-body:1.55`; párrafos lead con `max-width` en `ch` (52ch).
- **Radios**: 5→4, 7/9/10→8, 11/13/14→12, 16/17/20→18, 28→24 (5 valores de tarjeta → `--r-lg`, barras de gráfico unificadas en `--r-xs`).
- **Sombras**: 4 tokens (`--shadow-1/2/3/btn`); la sombra negra pura del chat y las variantes gratuitas absorbidas por la familia navy.
- **Easings y duraciones**: `cubic-bezier(.22,.61,.36,1)` y `(.45,0,.55,1)` → `--ease`; `.3/.35→--dur-base(.4)`, `.5/.6→--dur-slow(.55)`, reveals a `--dur-reveal(.7)`. Coreografía de delays (intro, hbars 2.05–2.53 s, hkpi, stagger, cf-node, DESLIZA 2.25 s) conservada intacta.
- **Contenedores**: 1180 px estándar y 880 px angosto (FAQ subió de 820 a 880).
- **Colores**: bordes claros consolidados (`#EAF1FA→--blue-100`, `#F0F5FB→--line`, `#C9DCF0→--border`); punteado navy unificado a alfa 0.055 (`.dotted-navy` ×3); tinta atenuada en 3 pasos (`--ink-66/55/45`).
- **Botones**: par CTA unificado (16 px / padding 16×32 / `--r-md` / hover con `translateY(-2px)` + `--shadow-btn`), variantes primary/ghost/navy.
- **DESLIZA**: un solo componente `.scroll-hint` (hintY 2 s, `--track-wide` 0.18em, `--w-55`, 12 px), con entrada propia a los 2.25 s y fade ligado al scroll vía `--hero-fade`.
- **Fase 3 (verificación)**: div raíz de la plantilla tokenizado (`var(--font)/var(--ink)/var(--white)`); `.scroll-hint` corregido a `--track-wide`/`--w-55` per contrato. Verificado en 1440/1024/390: hint visible y con fade correcto, 4 actos de la Historia activan con opacidad 1 en sus ventanas, sin overflow horizontal, sin errores de consola de página, composición visual correcta en las 6 capturas. Verificado también que `bounceY` y `floatY` siguen vivos (tarjetas flotantes del hero) y que solo queda un `:root` y cero `transition:all`.

### Pendiente

- **Header.dc.html / Footer.dc.html** (compartidos con otras páginas, fuera de alcance): Header con código muerto (`state.hidden`, `lang`/`esBg`/`enBg`/`setEs`/`setEn`, `navTransform`/`navOpacity` constantes) y easing propio; Footer con navy divergente `#082C52` ≠ `--navy`, botón 15 px/r12 y links 14.5 px.
- **ESLint sin configuración**: `npm run lint` pide setup interactivo (no existe `.eslintrc`); no se configuró en esta fase.
- **Errores preexistentes de `tsc`/`next build` en `src/`** (20 errores TS de tipos Supabase `never` en rutas API, `src/lib/supabase/server.ts` y `src/middleware.ts`): anteriores al refactor y ajenos a la landing (los commits de fases 1–2 solo tocan `AUDIT.md` y `public/dc/`); `vitest` pasa 15/15 y el build compila (falla solo en la validación de tipos por lo anterior).
- **`--fs-display` sin uso** en `:root` tras eliminar el lead-main (su comentario "Historia lead-main" quedó desfasado).
- **`.story-ph.pos-low` sin consumidores** (los 4 actos usan `pos-high`); se conserva como config del carrusel, igual que `.story-sub`/`sc-if hasSub` (ninguna frase tiene `subline` hoy).
- **Comentarios de `setStory` levemente desfasados** (describen leads en los 3 actos incl. "Acto 1 · Marca" y el stagger headline → sub → DESLIZA): JS intocable por contrato, solo documentación.
- **Colores hardcodeados en bindings JS de `renderVals`** (tabs activos, dots del slider, burbujas del chat, inventario ámbar/verde): fuera del alcance del refactor CSS; migrarlos a strings `var(--…)` es decisión aparte.
- **`sc-if showWhatsApp` constante-true** y su binding (botón permanente: decisión de producto); además el botón enlaza a `Agenda-demo.dc.html` con aria-label "Escríbenos por WhatsApp" (incongruencia de contenido/UX).
- **Decisiones de producto abiertas**: `font-weight:800` del número de Stats (único w800 del archivo), 24 px de los mini-stats de Feature Row 1 (candidato a token `--fs-stat-sm`), fusionar `.ind-card` con `.cf-node` en una tarjeta base, modificador `.icon-tile--white`, parcial único para la flecha SVG repetida 7×, token `--sec-head-mb` para el margen de cabecera de sección repetido, `tabular-nums` en los números animados de Stats.
- **Contenido placeholder**: array `logos` ('Su negocio', 'Tu marca', 'Cliente 3'…); Testimonios y Logos sin heading propio (la jerarquía de headings salta esas bandas).
- **Excepciones intencionales conservadas** (documentadas en AUDIT §5, no son deuda): rgba decorativas de blobs y rampa de los `hsq`, glow de `liveGlow`/`.hsq-in`, máscara `#000` del marquee, sombra y colores WhatsApp, tipografías por rol del h1/quote/panel (1.02/1.35/1.18), radios 50 % y decorativos 48/60 px, burbuja del chat 14/4 px (espeja el JS), duraciones decorativas (marquee 30 s, floatSq 4.5 s, etc.), coreografía completa de delays, y los valores estructurales de la Historia (gap/bottom 20 px, max-width 900/640 px, 13vh/15vh, 52vh reduced) y el padding especial del Hero.
