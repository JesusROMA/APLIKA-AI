# AUDITORÍA — Landing `public/dc/Aplika.ai.dc.html` (Fase 1)

Archivo auditado: `/Users/macbook/APLIKA-AI/public/dc/Aplika.ai.dc.html` (920 líneas, 296 atributos `style="..."`).
Verificaciones cruzadas contra: todas las páginas de `public/dc/`, `support.js`, `aplika-api.js`, `src/` y `public/videos/`.

---

## 1. Inventario de secciones de la página de inicio

Rangos contiguos y sin solaparse (el separador en blanco posterior a cada bloque se asigna al bloque que lo precede). La línea de cierre de cada sección es su `</section>`.

| # | Nombre | Marcador | Líneas (inicio–fin) |
|---|--------|----------|---------------------|
| 0 | Cabecera del archivo (doctype, `<head>`, apertura `<x-dc>`) | — | 1–9 |
| 1 | `<helmet>` + bloque `<style>` | `<helmet>` (l.10) / `<style>` **14–160** | 10–161 |
| 2 | Apertura del div raíz + Intro de carga | `<!-- ===== Intro de carga ... -->` (l.164) | 162–172 |
| 3 | Import Header | `<dc-import name="Header">` | 173–174 |
| 4 | Historia (video con scrubbing por scroll) | `<!-- ===== HISTORIA ... -->` (l.175–178) / `data-screen-label="Historia"` (l.179) | 175–203 |
| 5 | Hero (oscuro) | `<!-- ===== HERO (oscuro) ===== -->` (l.204) / `data-screen-label="Hero"` (l.205) | 204–267 |
| 6 | Logos / confianza (marquee) | `<!-- ===== LOGOS / confianza ===== -->` (l.268) | 268–286 |
| 7 | Feature tabs / Plataforma | `<!-- ===== FEATURE TABS (interactivo) ===== -->` (l.287) / `data-screen-label="Plataforma"`, `id="servicios"` (l.288) | 287–362 |
| 8 | Stats band | `<!-- ===== STATS band ===== -->` (l.363) / `data-anim="stats"` (l.364) | 363–374 |
| 9 | Feature Row 1 (inventario) | `<!-- ===== FEATURE ROW 1 ===== -->` (l.375) | 375–399 |
| 10 | Agentes de IA | `<!-- ===== AGENTES DE IA ===== -->` (l.400) / `data-screen-label="Agentes de IA"` (l.401) | 400–435 |
| 11 | Industrias preview | `<!-- ===== INDUSTRIAS preview ===== -->` (l.436) / `data-screen-label="Industrias"`, `id="industrias"` (l.437) | 436–457 |
| 12 | Cómo funciona preview | `<!-- ===== CÓMO FUNCIONA preview ===== -->` (l.458) / `data-screen-label="Cómo funciona"`, `id="como-funciona"` (l.459) | 458–483 |
| 13 | Testimonios (slider) | `<!-- ===== TESTIMONIOS (slider) ===== -->` (l.484) | 484–504 |
| 14 | FAQ | `<!-- ===== FAQ ===== -->` (l.505) | 505–519 |
| 15 | CTA final | `<!-- ===== CTA FINAL ===== -->` (l.520) / `data-screen-label="CTA"` (l.521) | 520–531 |
| 16 | Import Footer | `<dc-import name="Footer">` | 532–533 |
| 17 | WhatsApp flotante | `<!-- WhatsApp flotante -->` (l.534) | 534–540 |
| 18 | Cierre de plantilla (`</div></x-dc>`) | — | 541–542 |
| 19 | `<script type="text/x-dc">` (lógica de página) | `data-dc-script` (l.543) | 543–917 |
| 20 | Cierre del archivo (`</body></html>`) | — | 918–920 |

Sub-bloques del script (l.543–917), útiles para repartir trabajo:
- `state` inicial: 545–554 · `chatScript`: 556–561 · ciclo de vida (`componentDidMount`/`Unmount`): 563–592
- **Historia/scrub (NO tocar lógica)**: `storyPhrases` 601–607, `setStory` 609–705
- `countUp` 707–718 · `runChat` 720–740 · `setupReveal` 742–766 · `startStats` 768–783
- Datos (`tabs`, `aiItems`, `stats`, `industries`, `steps`, `logos`, `testimonials`, `faqData`): 785–835
- `renderVals`: 837–915

---

## 2. Código muerto

### 2.1 CSS muerto en el bloque `<style>` (l.14–160)

| Selector / regla | Línea | Veredicto | Verificación |
|---|---|---|---|
| `@keyframes spin` | 20 | **MUERTO** — borrar | `grep spin` en Aplika.ai.dc.html, support.js, aplika-api.js, Header y Footer: la única aparición es su definición. Ninguna `animation:spin` en todo `public/dc/` ni `src/`. |

Todo lo demás está VIVO. Clases añadidas dinámicamente, verificadas una a una:
- `.a-reveal` / `.a-in`: las añade `setupReveal()` (l.751, 755, 759).
- `.lead-on`: la alterna `setStory()` vía `classList.toggle('lead-on', active)` (l.685).
- `.story-reduced`: la añade `setStory()` en reduced-motion (l.632).
- `.open` (`.faq-body.open`): llega vía binding `bodyClass` de `renderVals` (l.911).
- `.pos-low` / `.pos-high` / `.lead-main`: llegan vía `posClass` de `storyPhrases` (l.602–606, 850).
- Keyframes `floatY` (l.252), `bounceY` (l.256, 264), `hintY` (l.199), `aIntroPop/Up/Out`, `hbGrow`, `livePulse`, `liveGlow`, `chatIn`, `typingDot`, `floatSq`, `marquee`: todos referenciados en el propio archivo.

### 2.2 JS muerto en el script de la página (l.543–917)

| Ítem | Línea | Veredicto |
|---|---|---|
| Binding `steps: this.steps` en `renderVals` | 863 | **MUERTO** — borrar solo esa línea. La plantilla nunca usa `{{ steps }}`; el flujo usa `{{ flowSteps }}` (l.891). El array `this.steps` (l.812) SÍ está vivo (lo consume `flowSteps`). |
| `console.log` / `console.debug` | — | No hay ninguno en la página. ✓ |
| Código comentado obsoleto | — | No hay: todos los comentarios del script son documentación viva (config de actos del video, etc.). |
| Funciones nunca llamadas | — | Ninguna: `countUp`, `runChat`, `setupReveal`, `startStats`, `setStory` se invocan todas. |
| Variables de estado sin uso | — | Todas las claves de `state` (l.545–554) se leen en `renderVals` o en la lógica. ✓ |

Casi-muerto (informativo, decisión de producto, no borrar a ciegas):
- `showWhatsApp: true` (l.856) es una constante: el `<sc-if>` de l.535 siempre es verdadero. Se puede quitar el binding y el `sc-if` si el botón es permanente.
- `logos = ['Su negocio','Tu marca','Cliente 3','Cliente 4','Cliente 5']` (l.819): contenido placeholder, no código muerto.
- `.story-ph.pos-low{...padding-bottom:13vh!important}` (l.131): su `padding-bottom` queda siempre pisado por `.lead-main` (l.139, definido después con la misma especificidad) porque `pos-low` solo se usa junto a `lead-main` (l.602). El `justify-content:flex-end` sí surte efecto. Redundancia parcial, no muerto.

### 2.3 Assets de `public/` no referenciados

**Ninguno.** `public/` solo contiene `dc/` y `videos/`. Los 3 archivos de `public/videos/` están referenciados por la landing:
- `aplika-hero.mp4` y `aplika-hero-poster.jpg` → l.181
- `aplika-hero-mobile.mp4` → l.644 (asignado por JS en móvil)

Verificado con grep en todas las páginas `public/dc/*.html` y en `src/` (ninguna otra página referencia assets; `src/` tampoco).

### 2.4 Notas informativas (NO borrar)

- Los errores de consola con `{{ item.d }}` son artefactos de pre-hidratación del framework dc (interpolaciones aún no resueltas que el runtime marca como `sc-interp sc-unresolved`), **no** código muerto.
- `support.js` y `aplika-api.js` son runtime/framework: los `console.error/warn/info` que contienen (p. ej. l.472, 1074 de support.js) son logging del runtime — fuera de alcance.
- `style-hover="..."` es feature del framework: support.js convierte `style-<pseudo>` en clases con hoja de estilos generada (support.js l.397–398, 1340–1354). No es un atributo inválido.
- Header.dc.html (compartido, fuera de alcance de fase 2) tiene su propio código muerto que queda **documentado como pendiente**: `state.hidden` nunca leído; `state.lang` + bindings `esBg/esColor/enBg/enColor/setEs/setEn` (l.150–153) sin uso en su plantilla; `navTransform`/`navOpacity` son constantes (l.142–143).

---

## 3. Redundancias

### 3.1 Patrones de estilo inline duplicados (candidatos a clase)

| Patrón (propiedades repetidas) | Ocurrencias | Dónde | Clase propuesta |
|---|---|---|---|
| Contenedor de sección `width:100%;max-width:1180px;margin:0 auto;padding:clamp(56px,8vw,100px) 24px` | 4 exactas + 4 variantes (1180px aparece 8×) | l.270, 289, 365, 377, 402, 438, 460 | `.container` + `.sec` |
| Botón primario `background:#378ADD;color:#FFF;font-size:16.5px;font-weight:600;padding:16px 30/32px;border-radius:13px` + hover `#4F9AE6;translateY(-2px)` | 3 grandes (l.193, 225, 526) + 2 medianos (l.414 `14px 26px` r12, l.480 navy `14px 28px` r12) | Historia, Hero, Agentes IA, Cómo funciona, CTA | `.btn`, `.btn-lg`, `.btn-navy` |
| Botón fantasma `background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.22)` + hover `0.16` | 2 (l.226, 527) | Hero, CTA | `.btn-ghost` |
| Eyebrow/kicker `font-size:14px;font-weight:600;color:#378ADD;letter-spacing:0.02em;margin:0 0 14px` | 5 (l.291, 441, 462, 487, 508) | Plataforma, Industrias, Cómo funciona, Testimonios, FAQ | `.eyebrow` |
| H2 de sección `clamp(26px,3.4vw,40px);600;1.14;-0.01em;#042C53` (y 3 variantes cercanas) | 3 exactas + 3 variantes (l.292, 380, 407, 442, 463, 508) | todas las secciones claras | `.h2` |
| Tarjeta demo tab `background:#FFF;border:1px solid #E6F1FB;border-radius:16px;padding:18px;box-shadow:0 18px 40px -24px rgba(12,68,124,0.3)` | 4 idénticas (l.312, 322, 341, 350) | Plataforma (4 tabs) | `.demo-card` |
| Píldora de estado `padding:4px 9px;border-radius:20px` + pares verde `#1FA85A/#E4F6EC` (4×) y ámbar `#B9682B/#FBEEDD` (4×) | 4 + variante `5px 11px` (l.389) | Plataforma, Feature Row 1 | `.pill-ok`, `.pill-warn` |
| Fondo de puntos `radial-gradient(rgba(255,255,255,0.055/0.06) 1.4px,transparent 1.4px);background-size:26px 26px` | 3 (l.26 CSS intro, 205 Hero, 521 CTA) | intro, Hero, CTA | `.dotted-navy` (y unificar la opacidad 0.055 vs 0.06) |
| Icon-tile `display:inline-flex;align-items:center;justify-content:center;width/height NN;background:#E6F1FB;border-radius:NN` | 5 con `#E6F1FB` + variantes blancas/navy (l.253, 305, 379, 449, 490, 512…) | 6 secciones | `.icon-tile` (+ modificador de tamaño) |
| Flecha SVG `M5 12h14M13 6l6 6-6 6` (mismo path completo) | 7 (l.193, 225, 308, 414, 444, 475, 480) | CTAs y links | fragmento/parcial único o clase `.arrow-ico` |
| Barras de gráfico `flex:1;height:N%;background:#B5D4F4/#378ADD;border-radius:5px 5px 0 0` (7×) y `4px 4px 0 0` (6×) | 13 | Hero (l.246), tab Dashboard (l.346) | `.bar` + unificar radio |
| Skeleton bar `height:7–9px;width:N%;background:#E6F1FB;border-radius:4px` | 7 (+4 con `#378ADD`/`#EEF3F9`/`#F0F5FB`) | tabs Venta/Búsqueda, Feature Row 1 | `.sk-bar` |
| Tarjeta flotante hero `display:flex;align-items:center;gap:10px;border-radius:14px;padding:12px 15px;box-shadow:0 20px 40px -18px rgba(2,18,38,0.5)` | 2 (l.252, 256) | Hero | `.float-card` |
| Badge de hero/IA `background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:7px 14/15px;color:#9CC6F0` | 2 (l.221, 406) | Hero, Agentes IA | `.badge-dark` |
| Botones circulares del slider (44px, border `#D8E6F5`, hover `#E6F1FB`) | 2 idénticos salvo el path (l.494, 500) | Testimonios | `.slider-btn` |
| Fila de logos del marquee (mismo estilo completo repetido para el duplicado aria-hidden) | 2 (l.275, 279) | Logos | `.mq-pill` |
| Fila de inventario `display:flex;align-items:center;gap:13px;background:#FFF;border:1px solid #EEF3F9;border-radius:12px;padding:13px` | 3 (l.391–393) | Feature Row 1 | `.inv-row` |
| Mini tarjeta producto `border:1px solid #EEF3F9;border-radius:11px;overflow:hidden` + interior | 5 (l.315–317, 353–354) | tabs Venta/Búsqueda | `.sk-product` |
| KPI card `background:#E6F1FB/#F5F8FC;border-radius:12px;padding:13px` + label 11px + valor 19px w700 | 3 (l.239–241) + 2 variantes r11/18px (l.343–344) | Hero, tab Dashboard | `.kpi` |

### 3.2 Componentes casi idénticos a fusionar

1. **Los dos indicadores DESLIZA** — Historia (l.198–200) vs Hero (l.263–265). Divergen sin motivo: `letter-spacing:0.2em` vs `0.18em`, color `rgba(255,255,255,0.6)` vs `0.5`, animación `hintY 2s` vs `bounceY 1.8s`. Fusionar en un componente/clase `.scroll-hint` con un solo set de valores.
2. **Las 4 tarjetas `tab-pop`** de Plataforma comparten shell idéntico (ver `.demo-card` arriba); solo cambia el interior.
3. **Tarjetas de Industrias (l.448) y nodos de Cómo funciona (l.467/`.cf-node`)**: mismo rol visual (tarjeta r18, padding 28, título 18px, cuerpo ~15px) con implementaciones distintas (inline vs clase). Unificar en una tarjeta base.
4. **Los dos botones CTA finales** (l.526–527) duplican el par del Hero (l.225–226) con paddings distintos (`16px 32px` vs `16px 30px`).
5. **Los 3 chips KPI del hero** (l.239–241) y los 2 del tab Dashboard (l.343–344): mismo diseño, radios y tamaños distintos (12px/19px vs 11px/18px).

### 3.3 Valores mágicos repetidos (conteo real en el archivo)

Colores hex (top): `#FFFFFF`×46, `#E6F1FB`×41, `#378ADD`×29, `#042C53`×24, `#0C447C`×21, `#F5F8FC`×14, `#B5D4F4`×11, `#EEF3F9`×9, `#1FA85A`×9, `#9CC6F0`×8, `#D8E6F5`×6, `#B9682B`×6, `#FBEEDD`×5, `#F0F5FB`×4, `#EAF1FA`×4, `#4FA0E8`×4, `#4F9AE6`×4, `#E4F6EC`×3, `#C9DCF0`×3, `#6FB3EC`×1, `#25D366`/`#1FB855`×1, `#0A3A6B`×1.

rgba más usados: `rgba(4,44,83,0.55)`×7, `rgba(4,44,83,0.5)`×5, `rgba(255,255,255,0.16)`×5, `rgba(12,68,124,0.3)`×4, `rgba(4,44,83,0.66)`×3, `rgba(255,255,255,0.1)`×3, `rgba(255,255,255,0.08)`×3. Tres familias de "oscuro" conviven: `rgba(4,44,83,…)` (tinta), `rgba(4,28,53,…)` (scrims/sombras) y `rgba(2,18,38,…)` (sombras) + 1 `rgba(0,0,0,0.55)`.

Radios: `4px`×14, `50%`×13, `12px`×11, `11px`×9, `20px`×8, `5px 5px 0 0`×7, `13px`×6, `5px`×6, `4px 4px 0 0`×6, `10px`×5, `999px`×4, `8px`×4, `16px`×4, `14px`×4, `9px`×3, `18px`×2, `24px`×2, `28px`×1, `17px`×1, `7px`×1, `60px`/`48px` (decorativos).

Easings: `cubic-bezier(.22,1,.36,1)`×18 (dominante), `cubic-bezier(.22,.61,.36,1)`×3, `cubic-bezier(.34,1.56,.64,1)`×2, `cubic-bezier(.45,0,.55,1)`×1, `transition:all .2s` sin easing ×3 (l.296, 448, 497).

Duraciones en transiciones: `.2s`×14, `.5s`×6, `.55s`×5, `.6s`×3, `.35s`×3, `.7s`×2, `.4s`×1, `.3s`×1.

Sombras: `0 18px 40px -24px rgba(12,68,124,0.3)`×4; `0 20px 40px -18px rgba(2,18,38,0.5)`×2; `0 14px 28px -12px rgba(55,138,221,0.7)`×2; únicas: `0 40px 80px -36px rgba(2,18,38,0.7)`, `0 30px 60px -30px rgba(0,0,0,0.55)`, `0 22px 44px -24px rgba(12,68,124,0.32)`, `0 18px 40px -14px rgba(2,18,38,0.6)`, `0 10px 28px -8px rgba(37,211,102,0.6)`.

Font-sizes px: `14px`×14, `12px`×13, `11px`×9, `13px`×8, `18px`×5, `16px`×5, `16.5px`×5, `15px`×5, `19px`×3, `17px`×3, `15.5px`×3, `24px`×2, `13.5px`×2, `14.5px`×1, `32px`×1 — 15 tamaños px distintos + 15 clamps distintos.

---

## 4. Inconsistencias de look & feel

### 4.1 Títulos H2 de sección (deberían ser UNO)

| Sección | font-size | line-height | letter-spacing | weight |
|---|---|---|---|---|
| Plataforma (l.292) | `clamp(28px,3.6vw,44px)` | 1.13 | −0.02em | 600 |
| Feature Row 1 (l.380) | `clamp(26px,3.2vw,38px)` | 1.15 | −0.01em | 600 |
| Agentes IA (l.407) | `clamp(27px,3.4vw,42px)` | 1.12 | −0.01em | 600 |
| Industrias (l.442) | `clamp(26px,3.4vw,40px)` | 1.14 | −0.01em | 600 |
| Cómo funciona (l.463) | `clamp(26px,3.4vw,40px)` | 1.14 | −0.01em | 600 |
| FAQ (l.508) | `clamp(26px,3.4vw,40px)` | 1.14 | −0.01em | 600 |
| CTA final (l.523) | `clamp(30px,4vw,52px)` | 1.08 | −0.02em | 700 |

→ 5 clamps distintos para el mismo rol. Dominante: `clamp(26px,3.4vw,40px)/1.14/−0.01em` (3×). CTA es rol "title" (más grande, 700): válido como segundo nivel, junto con Stats `clamp(34px,4.4vw,52px)` w800 (único `font-weight:800` del archivo) e Historia `clamp(28px,4.6vw,56px)` w700.

### 4.2 Cuerpo / leads

| Sección | Texto descriptivo | line-height | color |
|---|---|---|---|
| Hero (l.223) | `clamp(17px,1.9vw,21px)` | 1.55 | `rgba(255,255,255,0.74)` |
| CTA final (l.524) | `clamp(17px,1.8vw,20px)` | 1.55 | `rgba(255,255,255,0.74)` |
| Plataforma/FR1/AI (l.302, 381, 408) | `17px` | 1.6 | `rgba(4,44,83,0.66)` / `rgba(255,255,255,0.76)` |
| Industrias card (l.451) | `15px` | 1.55 | `rgba(4,44,83,0.62)` |
| Cómo funciona card (l.473) | `14.5px` | 1.55 | `rgba(4,44,83,0.62)` |
| FAQ respuesta (l.513) | `15px` | 1.6 | `rgba(4,44,83,0.66)` |
| Agentes IA items (l.411) | `14px` | 1.45 | `rgba(255,255,255,0.66)` |
| Stats label (l.369) | `15px` | 1.45 | `rgba(255,255,255,0.66)` |

→ Divergencias: dos clamps de lead casi iguales (1.8vw/20px vs 1.9vw/21px); cuerpo de tarjeta 14px/14.5px/15px según sección; line-height 1.45/1.55/1.6 sin criterio; texto atenuado con 6 opacidades de tinta (0.62/0.66/0.55/0.5/0.45/0.4).

### 4.3 Padding vertical de sección

| Sección | padding-y |
|---|---|
| FR1, Agentes IA, Industrias, Cómo funciona, Testimonios, FAQ | `clamp(56px,8vw,100px)` ✓ dominante (6×) |
| Plataforma, CTA final | `clamp(60px,9vw,110px)` |
| Stats | `clamp(48px,7vw,80px)` |
| Logos | `36px` fijo (única sección sin clamp) |
| Hero | `clamp(116px,14vw,150px)` top / `clamp(20px,3vw,40px)` bottom (especial, por el header fijo) |

### 4.4 Anchos máximos de contenedor

| Contenedor | max-width |
|---|---|
| Todas las secciones estándar | `1180px` (8×) ✓ |
| Testimonios, CTA final | `880px` |
| FAQ | `820px` ← divergente, normalizar a 880px |

### 4.5 Radios

| Uso | Valores encontrados | Divergencia |
|---|---|---|
| Tarjetas grandes | 16 (demo-card), 18 (industrias, cf-node), 20 (paneles hero/FR1/chat), 24 (frame tabs), 28 (banner IA) | 5 valores para el mismo rol |
| FAQ item | **14px** (l.511) | el resto de tarjetas usa 16/18 |
| Botones CTA | **13px** (hero/CTA/historia) vs **12px** (IA l.414, Cómo funciona l.480, Footer) | unificar |
| Chips/KPI/filas | 11 y 12 mezclados (KPIs hero 12 vs tab dashboard 11; skeletons 11) | unificar en 12 |
| Iconos tile | 7, 8, 9, 10, 11, 13, 14, 17 | escala continua sin criterio |
| Barras gráfico | `5px 5px 0 0` (hero) vs `4px 4px 0 0` (tab) | unificar |

### 4.6 Sombras

| Sección | Sombra |
|---|---|
| Tarjetas demo (Plataforma) | `0 18px 40px -24px rgba(12,68,124,0.3)` ✓ 4× |
| cf-node hover | `0 22px 44px -24px rgba(12,68,124,0.32)` — variante gratuita de la anterior |
| Flotantes hero | `0 20px 40px -18px rgba(2,18,38,0.5)` |
| Panel hero | `0 40px 80px -36px rgba(2,18,38,0.7)` |
| CTA historia | `0 18px 40px -14px rgba(2,18,38,0.6)` |
| Chat IA | `0 30px 60px -30px rgba(0,0,0,0.55)` ← único negro puro; el resto usa la familia navy |
| Botón hover | `0 14px 28px -12px rgba(55,138,221,0.7)` 2× |

### 4.7 Easings y duraciones

| Sección/uso | Valor | Nota |
|---|---|---|
| Reveals, leads, FAQ, hovers ricos | `cubic-bezier(.22,1,.36,1)` | dominante (18×) — estándar |
| Barras hero, stagger, live-bar | `cubic-bezier(.22,.61,.36,1)` | 3×, casi igual al estándar |
| Intro, cf-node | `cubic-bezier(.34,1.56,.64,1)` | spring — mantener como token aparte |
| floatSq | `cubic-bezier(.45,0,.55,1)` | 1×, normalizable a ease-in-out |
| Tabs (l.296), Industrias card (l.448), dots (l.497) | `transition:all .2s` | sin easing y con `all` — corregir a propiedades explícitas + easing estándar |
| DESLIZA | `hintY 2s` vs `bounceY 1.8s` | dos animaciones para el mismo gesto |

### 4.8 Colores divergentes

- **Footer** (compartido — pendiente, fuera de fase 2): fondo `#082C52`, distinto del navy `#0C447C` del resto.
- Hover de azul: `#4F9AE6` (botones) convive con `#4FA0E8` (acento marca) — casi indistinguibles; consolidar en tokens separados a propósito o unificar.
- Bordes claros: 6 tonos casi iguales (`#E6F1FB`, `#EAF1FA`, `#EEF3F9`, `#D8E6F5`, `#C9DCF0`, `#F0F5FB`) usados indistintamente como borde/skeleton — consolidar a 3.
- Punteado de fondo: `rgba(255,255,255,0.06)` en intro vs `0.055` en Hero/CTA.
- `#0A3A6B` (hover navy, 1×) y `#1FB855` (hover WhatsApp, 1×): tokens hover únicos.

### 4.9 Tipografías menores

- Botones: `16.5px` (hero/CTA/historia) vs `16px` (IA/Cómo funciona) vs `15px` (footer).
- Links "Ver todas / Conoce": `15.5px` (3×) — tamaño que solo existe aquí y en bullets (l.305).
- Medios píxeles: `13.5px`×2, `14.5px`×1, `15.5px`×3, `16.5px`×5 — eliminar la sub-escala de .5px.
- Letter-spacing de labels: `0.2em` vs `0.18em` (DESLIZA), `0.02em` (eyebrows) ✓ consistente.

---

## 5. CONTRATO DE DISEÑO (fuente de verdad para fases 2–3)

Derivado exclusivamente de valores existentes (paleta y Plus Jakarta Sans intactas). Pegar al inicio del bloque `<style>`:

```css
:root{
  /* ===== Paleta (hex existentes) ===== */
  --navy:#0C447C;            /* marca / fondos oscuros */
  --navy-hover:#0A3A6B;
  --ink:#042C53;             /* texto principal */
  --blue:#378ADD;            /* acento / CTA */
  --blue-hover:#4F9AE6;
  --blue-bright:#4FA0E8;     /* acento marca (logo, dots) */
  --blue-300:#9CC6F0;
  --blue-200:#B5D4F4;
  --blue-100:#E6F1FB;        /* superficie azul clara / bordes suaves */
  --blue-logo:#6FB3EC;       /* ".ai" del logo */
  --surface:#F5F8FC;         /* fondo de paneles claros */
  --line:#EEF3F9;            /* borde hairline / skeleton */
  --border:#D8E6F5;          /* borde visible (inputs, slider) */
  --white:#FFFFFF;
  --green:#1FA85A;  --green-bg:#E4F6EC;
  --amber:#B9682B;  --amber-bg:#FBEEDD;
  --whatsapp:#25D366; --whatsapp-hover:#1FB855;

  /* rgba más usados (blanco sobre navy) */
  --w-85:rgba(255,255,255,0.85); --w-74:rgba(255,255,255,0.74);
  --w-66:rgba(255,255,255,0.66); --w-55:rgba(255,255,255,0.55);
  --w-22:rgba(255,255,255,0.22); --w-16:rgba(255,255,255,0.16);
  --w-10:rgba(255,255,255,0.1);  --w-08:rgba(255,255,255,0.08);
  /* rgba de tinta (navy sobre blanco) */
  --ink-66:rgba(4,44,83,0.66);   /* cuerpo atenuado */
  --ink-55:rgba(4,44,83,0.55);   /* muted */
  --ink-45:rgba(4,44,83,0.45);   /* faint */
  /* oscuro para scrims/sombras */
  --dark:4,28,53;                /* usar rgba(var(--dark),x) */

  /* ===== Tipografía (consolidada, clamp) ===== */
  --font:'Plus Jakarta Sans',system-ui,sans-serif;
  --fs-display:clamp(56px,7vw,112px);   /* Historia lead-main */
  --fs-h1:clamp(38px,6vw,68px);         /* Hero */
  --fs-title:clamp(30px,4vw,52px);      /* CTA final, Historia h2, números Stats */
  --fs-h2:clamp(26px,3.4vw,40px);       /* H2 de sección (único) */
  --fs-h3:clamp(22px,2.6vw,30px);       /* subtítulos / quote */
  --fs-card-title:18px;                 /* títulos de tarjeta */
  --fs-lead:clamp(17px,1.9vw,21px);     /* párrafo lead */
  --fs-body:16px;                       /* botones, FAQ pregunta, UI */
  --fs-body-sm:15px;                    /* cuerpo de tarjetas */
  --fs-small:14px;                      /* meta, roles, labels */
  --fs-caption:12px;                    /* micro-labels, badges */
  --lh-tight:1.1;   /* titulares (1.02–1.15 → por rol) */
  --lh-snug:1.45;   /* labels/stats */
  --lh-body:1.55;   /* cuerpo (absorbe 1.5/1.6) */
  --track-tight:-0.02em; --track-label:0.02em; --track-wide:0.18em;

  /* ===== Espaciado (base 8px) ===== */
  --sp-1:8px; --sp-2:16px; --sp-3:24px; --sp-4:32px; --sp-5:40px;
  --sp-6:48px; --sp-8:64px; --sp-10:80px; --sp-12:96px;
  --sec-y:clamp(56px,8vw,100px);        /* padding vertical estándar de sección */
  --sec-y-lg:clamp(60px,9vw,110px);     /* secciones destacadas (Plataforma, CTA) */
  --sec-x:24px;

  /* ===== Radios ===== */
  --r-xs:4px;    /* barras, skeletons (absorbe 5px) */
  --r-sm:8px;    /* icon-tiles pequeños (absorbe 7/9/10px) */
  --r-md:12px;   /* chips, KPIs, filas, botones (absorbe 11/13/14px) */
  --r-lg:18px;   /* tarjetas (absorbe 16/17/20px) */
  --r-xl:24px;   /* frames/banners (absorbe 28px) */
  --r-full:999px;

  /* ===== Sombras ===== */
  --shadow-1:0 18px 40px -24px rgba(12,68,124,0.3);   /* tarjeta */
  --shadow-2:0 20px 40px -18px rgba(2,18,38,0.5);     /* flotante */
  --shadow-3:0 40px 80px -36px rgba(2,18,38,0.7);     /* panel héroe */
  --shadow-btn:0 14px 28px -12px rgba(55,138,221,0.7);/* hover CTA */

  /* ===== Timing ===== */
  --ease:cubic-bezier(.22,1,.36,1);         /* estándar */
  --ease-spring:cubic-bezier(.34,1.56,.64,1);
  --dur-fast:.2s;    /* hovers */
  --dur-base:.4s;    /* acordeón, chat (absorbe .3/.35) */
  --dur-slow:.55s;   /* leads/stagger (absorbe .5/.6) */
  --dur-reveal:.7s;  /* scroll-reveal */

  /* ===== Layout ===== */
  --container:1180px;
  --container-narrow:880px;   /* Testimonios, CTA, FAQ */
}
```

### Tabla de mapeo valor actual → token (⚠ = se normaliza, cambia el valor)

| Valor actual | Token | Nota |
|---|---|---|
| `#0C447C` | `var(--navy)` | |
| `#042C53` | `var(--ink)` | |
| `#378ADD` | `var(--blue)` | |
| `#4F9AE6` | `var(--blue-hover)` | |
| `#4FA0E8` | `var(--blue-bright)` | |
| `#9CC6F0` / `#B5D4F4` / `#E6F1FB` | `var(--blue-300/200/100)` | |
| `#EAF1FA` | `var(--blue-100)` | ⚠ normaliza a `#E6F1FB` |
| `#F0F5FB` | `var(--line)` | ⚠ normaliza a `#EEF3F9` |
| `#C9DCF0` | `var(--border)` | ⚠ normaliza a `#D8E6F5` |
| `#F5F8FC` / `#EEF3F9` / `#D8E6F5` | `var(--surface/line/border)` | |
| `#1FA85A`+`#E4F6EC` / `#B9682B`+`#FBEEDD` | `var(--green/green-bg/amber/amber-bg)` | |
| `rgba(4,44,83,0.6–0.7)` | `var(--ink-66)` | ⚠ 0.6/0.62/0.7 → 0.66 |
| `rgba(4,44,83,0.5–0.55)` | `var(--ink-55)` | ⚠ 0.5 → 0.55 |
| `rgba(4,44,83,0.4–0.45)` | `var(--ink-45)` | ⚠ 0.4 → 0.45 |
| `rgba(255,255,255,0.72/0.74/0.76)` | `var(--w-74)` | ⚠ |
| `rgba(255,255,255,0.5/0.55/0.6)` | `var(--w-55)` | ⚠ (DESLIZA unificado) |
| `rgba(2,18,38,x)` y `rgba(0,0,0,0.55)` | `rgba(var(--dark),x)` / sombras token | ⚠ familia única navy oscuro |
| `rgba(255,255,255,0.06)` (intro) | `rgba(255,255,255,0.055)` | ⚠ punteado único |
| `clamp(28px,3.6vw,44px)`, `clamp(27px,3.4vw,42px)`, `clamp(26px,3.2vw,38px)` | `var(--fs-h2)` | ⚠ los 3 → `clamp(26px,3.4vw,40px)` |
| `clamp(28px,4.6vw,56px)`, `clamp(34px,4.4vw,52px)` | `var(--fs-title)` | ⚠ → `clamp(30px,4vw,52px)` |
| `clamp(22px,3vw,32px)` (quote) | `var(--fs-h3)` | ⚠ → `clamp(22px,2.6vw,30px)` |
| `clamp(17px,1.8vw,20px)`, `clamp(16px,1.9vw,22px)` | `var(--fs-lead)` | ⚠ → `clamp(17px,1.9vw,21px)` |
| `16px` / `16.5px` | `var(--fs-body)` | ⚠ 16.5 → 16 |
| `15px` / `15.5px` / `14.5px` | `var(--fs-body-sm)` | ⚠ → 15 |
| `13px` / `13.5px` / `14px` | `var(--fs-small)` | ⚠ → 14 |
| `11px` / `12px` | `var(--fs-caption)` | ⚠ → 12 (revisar KPIs 11px visualmente) |
| `17px` (desc secciones) | `var(--fs-lead)` en min | o dejar como `--fs-body`+1; decidir en fase 2 con el mismo criterio en las 3 apariciones |
| `18px`/`19px` (títulos tarjeta / KPI) | `var(--fs-card-title)` | ⚠ 19 → 18 |
| `line-height:1.5/1.6` | `var(--lh-body)` | ⚠ → 1.55 |
| `letter-spacing:0.2em` | `var(--track-wide)` | ⚠ → 0.18em |
| `border-radius:5px …` | `var(--r-xs)` | ⚠ → 4px |
| `border-radius:7/9/10px` | `var(--r-sm)` | ⚠ → 8px |
| `border-radius:11/13/14px` | `var(--r-md)` | ⚠ → 12px |
| `border-radius:16/17/20px` | `var(--r-lg)` | ⚠ → 18px |
| `border-radius:28px` | `var(--r-xl)` | ⚠ → 24px |
| `0 22px 44px -24px rgba(12,68,124,0.32)` | `var(--shadow-1)` | ⚠ |
| `0 18px 40px -14px rgba(2,18,38,0.6)` / `0 30px 60px -30px rgba(0,0,0,0.55)` | `var(--shadow-2)` | ⚠ |
| `cubic-bezier(.22,.61,.36,1)` / `(.45,0,.55,1)` | `var(--ease)` | ⚠ |
| `transition:all .2s` | `transition:<props> var(--dur-fast) var(--ease)` | ⚠ sin `all` |
| `.3s/.35s/.4s` | `var(--dur-base)` | ⚠ → .4s |
| `.5s/.55s/.6s` | `var(--dur-slow)` | ⚠ → .55s (verificar leads Historia visualmente) |
| `max-width:820px` (FAQ) | `var(--container-narrow)` | ⚠ → 880px |
| `padding:clamp(48px,7vw,80px)` (Stats) y `36px` (Logos) | `var(--sec-y)` o variante corta consciente | decidir en fase 2; Logos puede quedar como banda corta explícita |

**No se normalizan** (intencionales): `#25D366/#1FB855` (WhatsApp), `#6FB3EC` (logo), gradiente del scrim de Historia, `--fs-display/--fs-h1`, radios decorativos 48/60px de los blobs, `--ease-spring`, timings del scrub/leads dentro de `setStory` (JS intacto).

---

## 6. Plan de ejecución para FASE 2

**Regla general para todos los trabajos**: no tocar `setStory`/lógica de scrub, ni `support.js`/`aplika-api.js`. Cada trabajo opera SOLO dentro de sus líneas del inventario (§1). Los cambios ⚠ de la tabla de mapeo se aplican al tokenizar.

0. **GLOBAL — bloque `<style>` + tokens (l.10–161)** *(hacer primero; los demás dependen de él)*
   - Pegar el `:root` del contrato al inicio del `<style>`.
   - Borrar `@keyframes spin` (l.20).
   - Crear clases utilitarias: `.container`, `.sec`, `.sec-lg`, `.eyebrow`, `.h2`, `.btn`, `.btn-ghost`, `.btn-navy`, `.demo-card`, `.pill-ok/.pill-warn`, `.icon-tile`, `.kpi`, `.bar`, `.sk-bar`, `.float-card`, `.badge-dark`, `.scroll-hint`, `.dotted-navy`, `.slider-btn`.
   - Reescribir los valores duros del propio `<style>` con tokens (easings, duraciones, radios) — cuidado: mantener los delays de la intro y del hero tal cual (coreografía).
1. **Intro de carga (l.162–172 + CSS l.25–39)**: tokenizar colores/radios; unificar punteado a `0.055`; sin código muerto propio.
2. **Historia (l.175–203)**: tokenizar SOLO estilos inline (CTA → `.btn`, DESLIZA → `.scroll-hint` con valores unificados 0.18em/`--w-55`); NO tocar estructura `data-story`, clases `story-*`, ni el JS. Documentar que `pos-low` tiene padding-bottom pisado por `lead-main` (limpieza opcional en CSS).
3. **Hero (l.204–267)**: contenedor → `.container`; CTAs → `.btn`/`.btn-ghost` (padding unificado 16×32); KPIs → `.kpi` (19→18px, r12); barras → `.bar`; flotantes → `.float-card`; badge → `.badge-dark`; DESLIZA → `.scroll-hint` (fusiona con el de Historia); punteado → `.dotted-navy`.
4. **Logos (l.268–286)**: extraer `.mq-pill` (elimina el estilo duplicado del track duplicado); tokenizar; decidir padding de banda.
5. **Plataforma/tabs (l.287–361)**: `.demo-card` ×4; `.eyebrow`; h2 → `--fs-h2` (⚠ baja de 44 a 40 en máx.); botones de tab sin `transition:all`; skeletons → `.sk-bar`/`.sk-product`; barras `4px 4px 0 0` → `--r-xs`; padding sección: decidir si baja a `--sec-y`.
6. **Stats (l.363–374)**: número → `--fs-title` (⚠ w800 → decidir si se mantiene 800 como excepción o baja a 700); label → `--fs-body-sm`/`--lh-snug`; padding → `--sec-y`.
7. **Feature Row 1 (l.375–399)**: h2 → `--fs-h2` (⚠ sube de 38 a 40 máx.); filas → `.inv-row`; pills → `.pill-*`; borde `#EAF1FA` → `--blue-100`.
8. **Agentes de IA (l.400–435)**: h2 → `--fs-h2`; CTA → `.btn` (⚠ 16px/r12 → 16px/`--r-md`… unificar con el resto: padding 16×30); sombra del chat → `--shadow-2`; banner r28 → `--r-xl`; badge → `.badge-dark`; items 14px/1.45 → `--fs-small`/`--lh-snug`.
9. **Industrias (l.436–457)**: tarjetas → clase base compartida (r18 → `--r-lg`), quitar `transition:all`; hover translateY(-3px) → unificar con -2px de botones o documentar excepción; cuerpo 15px → `--fs-body-sm`.
10. **Cómo funciona (l.458–483)**: cuerpo 14.5px → `--fs-body-sm` (⚠ 15px); CTA navy → `.btn-navy`; `cf-*` del `<style>` tokenizados en el trabajo 0; sombra hover cf-node → `--shadow-1`.
11. **Testimonios (l.484–504)**: quote → `--fs-h3` (⚠); botones → `.slider-btn`; dots sin `transition:all`; container → `--container-narrow`.
12. **FAQ (l.505–519)**: container 820 → `--container-narrow` (⚠ 880); radius 14 → `--r-lg` (⚠ 18, la divergencia señalada); respuesta → `--fs-body-sm`/`--lh-body`.
13. **CTA final (l.520–531)**: h2 → `--fs-title`; lead → `--fs-lead` (⚠); CTAs → `.btn`/`.btn-ghost`; punteado → `.dotted-navy`; padding → `--sec-y-lg`.
14. **WhatsApp flotante (l.534–540)**: tokenizar colores WhatsApp; opcional: eliminar `sc-if showWhatsApp` constante y su binding.
15. **Script (l.543–917)**: borrar binding muerto `steps: this.steps` (l.863). Nada más: sin console.*, sin funciones muertas. PROHIBIDO tocar `storyPhrases`/`setStory`/`setupReveal`/timings.

**FUERA DE ALCANCE de fase 2** (compartidos con otras páginas — solo documentado como pendiente):
- `Header.dc.html`: código muerto (`state.hidden`, `lang`/`esBg`/`enBg`/`setEs`/`setEn`, `navTransform`/`navOpacity` constantes); easing propio `cubic-bezier(.4,0,.2,1)`; 13.5px.
- `Footer.dc.html`: fondo `#082C52` ≠ `--navy #0C447C`; botón 15px/r12 ≠ `.btn`; links `14.5px`.
- `support.js` / `aplika-api.js`: runtime del framework — intocables.
