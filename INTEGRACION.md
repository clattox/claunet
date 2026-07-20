# Integración en claunet.cl

Archivos de este paquete:
- `cookie-consent.css`
- `cookie-consent.js`
- `politica-de-privacidad.html`
- `api/consent.js` (función serverless de Vercel)

## Pasos en index.html (y trabajos.html)

1. En el `<head>`, después de `<link rel="stylesheet" href="style.css">`:

```html
<link rel="stylesheet" href="cookie-consent.css">
```

2. Justo antes de `</body>` (después del `<script>` del theme-toggle):

```html
<script src="cookie-consent.js"></script>
```

## Sube estos archivos a la raíz del repo

```
/index.html
/trabajos.html
/style.css
/cookie-consent.css      ← nuevo
/cookie-consent.js       ← nuevo
/politica-de-privacidad.html   ← nuevo
/api/consent.js          ← nuevo (Vercel lo detecta solo)
```

Vercel detecta cualquier archivo dentro de `/api` como función
serverless automáticamente, sin importar que el resto del sitio sea
estático — no necesitas Next.js para esto.

## Pendiente antes de darlo por cumplido

- [ ] Completar los `<!-- TODO -->` de `politica-de-privacidad.html`
      (correo de contacto real, fecha, si usas Analytics u otra
      herramienta de medición)
- [ ] Conectar `api/consent.js` a algo persistente — hoy solo hace
      `console.log`, que se pierde en los logs de Vercel con el tiempo
- [ ] Repetir el mismo enlace a "política de privacidad" en el footer
      del `index.html`, no solo en el banner
