# Frontend Claude Design — `public/dc/`

Coloca aquí **tal cual** los archivos del `.zip` del frontend (sin rediseñar):

```
public/dc/
  support.js
  aplika-api.js          ← ya incluido (cliente de /api)
  Aplika.ai.dc.html
  Servicios.dc.html
  Precios.dc.html
  Como-funciona.dc.html
  Industrias.dc.html
  Sobre-nosotros.dc.html
  Agenda-demo.dc.html
  Login.dc.html
  Header.dc.html
  Footer.dc.html
  Panel Cliente.dc.html
  Panel Super-admin.dc.html
  Admin Design System.dc.html
```

Next.js sirve `public/` como estático, así que quedan en:
`https://tu-dominio/dc/Panel Cliente.dc.html`, etc. **No se modifica el diseño.**

Para conectar los datos reales, sigue [`INTEGRACION-FRONTEND.md`](../../INTEGRACION-FRONTEND.md)
(en la raíz del repo): son ediciones mecánicas que reemplazan los arreglos mock
por llamadas a `window.AplikaAPI`, conservando el HTML/estilos intactos.
