// api/callback.js
// Vercel Serverless Function — OAuth con GitHub para Sveltia CMS (paso 2).
//
//   GET /api/callback?code=…&state=…
//
// Es la URL que GitHub llama después del consentimiento (la «Authorization
// callback URL» registrada en la OAuth App). Aquí vive el Client Secret:
// cambia el `code` por un `access_token`, que se entrega **solo** a la ventana
// del CMS que abrió el popup, mediante el mensaje `authorization:github:…`.
//
// Porte a Vercel de `sveltia/sveltia-cms-auth` (Cloudflare Worker, MIT).
// Autocontenido a propósito (ver api/auth.js).
//
// Variables de entorno:
//   GITHUB_CLIENT_ID      obligatoria
//   GITHUB_CLIENT_SECRET  obligatoria (marcar como «Sensitive» en Vercel)
//   ALLOWED_DOMAINS       recomendada; es la lista de orígenes que pueden
//                         recibir el token

const PROVIDER = 'github';
const ENDPOINT_TOKEN = 'https://github.com/login/oauth/access_token';
// El mismo formato que usa GitHub; se valida para no aceptar cualquier cookie.
const COOKIE_CSRF = /\bcsrf-token=github_([0-9a-f]{32})\b/;

/** Escapa texto para incrustarlo en HTML. */
const esc = (v) =>
  String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Serializa un valor como literal de JS seguro dentro de un <script>. */
const js = (v) => JSON.stringify(v === undefined ? null : v).replace(/</g, '\\u003c');

/**
 * Convierte una entrada de ALLOWED_DOMAINS en el patrón anclado que usará el
 * script del navegador para decidir si el origen que abrió el popup es de
 * confianza. Sin lista, no se filtra (mismo criterio que el original).
 * @param {string} [valor]
 * @returns {string[]} Patrones de expresión regular.
 */
const patronesDeDominio = (valor) =>
  (valor || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => `^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.+')}$`);

/**
 * Página que hace el apretón de manos con el CMS. El CMS escucha el mensaje
 * `authorizing:github`, lo responde desde su propio origen y entonces —solo
 * entonces— se le envía el token. El origen de un evento `message` lo pone el
 * navegador y no se puede falsificar, así que es la única prueba fiable de
 * quién abrió esta ventana.
 */
const paginaApreton = ({ token, error, errorCode }) => {
  const exito = Boolean(token);
  // Mismo contenido que el authenticator original: el CMS usa `errorCode`
  // para traducir el mensaje.
  const contenido = exito ? { provider: PROVIDER, token } : { provider: PROVIDER, error, errorCode };
  const mensaje = `authorization:${PROVIDER}:${exito ? 'success' : 'error'}:${js(contenido)}`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>ClauNet — acceso</title>
</head>
<body style="font:16px/1.5 system-ui,sans-serif;margin:4rem auto;max-width:36rem;padding:0 1.5rem">
<h1 style="font-size:1.1rem">${exito ? 'Acceso concedido' : 'No se pudo iniciar el acceso'}</h1>
<p>${
    exito
      ? 'Ya puedes cerrar esta ventana y volver al panel de edición.'
      : `${esc(error)}${errorCode ? ` <code>(${esc(errorCode)})</code>` : ''} Se puede cerrar esta ventana.`
  }</p>
<script>
(() => {
  const patrones = ${js(patronesDeDominio(process.env.ALLOWED_DOMAINS))};
  const mensaje = ${js(mensaje)};
  const tieneToken = ${exito};

  const esDeConfianza = (origen) => {
    try {
      const { hostname } = new URL(origen);

      return patrones.some((patron) => new RegExp(patron).test(hostname));
    } catch {
      return false;
    }
  };

  window.addEventListener('message', (evento) => {
    if (evento.data !== 'authorizing:${PROVIDER}') {
      return;
    }

    // Un error no lleva secreto y siempre se comunica, para que la pantalla
    // de acceso explique qué pasó.
    if (tieneToken && patrones.length && !esDeConfianza(evento.origin)) {
      return;
    }

    window.opener?.postMessage(mensaje, evento.origin);
  });

  window.opener?.postMessage('authorizing:${PROVIDER}', '*');
})();
</script>
</body>
</html>`;
};

/** Responde con HTML y sin caché: esta página lleva el token en el HTML. */
const enviarHtml = (res, body, status = 200) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  // Se borra el testigo anti-CSRF, ya usado.
  res.setHeader('Set-Cookie', 'csrf-token=deleted; HttpOnly; Max-Age=0; Path=/; SameSite=Lax; Secure');
  res.end(body);
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Allow', 'GET');
    res.end(JSON.stringify({ error: 'Método no permitido' }));
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host || 'claunet.cl'}`);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const testigo = (req.headers.cookie || '').match(COOKIE_CSRF)?.[1] || '';

  if (!code || !state) {
    enviarHtml(res, paginaApreton({
      error: 'Failed to receive an authorization code. Please try again later.',
      errorCode: 'AUTH_CODE_REQUEST_FAILED',
    }));
    return;
  }

  // CSRF: el `state` que devuelve GitHub tiene que ser el mismo testigo que
  // dejamos en la cookie HttpOnly al empezar (y que solo ve este servidor).
  if (!testigo || testigo !== state) {
    console.error('[oauth-callback] estado CSRF inválido');
    enviarHtml(res, paginaApreton({
      error: 'Potential CSRF attack detected. Authentication flow aborted.',
      errorCode: 'CSRF_DETECTED',
    }));
    return;
  }

  const clientId = process.env.GITHUB_CLIENT_ID || '';
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    console.error('[oauth-callback] faltan GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET');
    enviarHtml(res, paginaApreton({
      error: 'OAuth app client ID or secret is not configured.',
      errorCode: 'MISCONFIGURED_CLIENT',
    }));
    return;
  }

  let token = '';
  let error = '';

  try {
    const respuesta = await fetch(ENDPOINT_TOKEN, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, client_id: clientId, client_secret: clientSecret }),
    });

    ({ access_token: token, error } = await respuesta.json());
  } catch (err) {
    console.error('[oauth-callback] fallo al pedir el token:', err.message);
    enviarHtml(res, paginaApreton({
      error: 'Failed to request an access token. Please try again later.',
      errorCode: 'TOKEN_REQUEST_FAILED',
    }));
    return;
  }

  if (!token) {
    console.error('[oauth-callback] GitHub no devolvió token:', error || 'sin detalle');
    enviarHtml(res, paginaApreton({
      error: error || 'Server responded with malformed data. Please try again later.',
    }));
    return;
  }

  // Solo por log: nunca el token completo.
  console.log(`[oauth-callback] token emitido (${token.slice(0, 4)}…)`);
  enviarHtml(res, paginaApreton({ token }));
};

