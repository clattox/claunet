// api/auth.js
// Vercel Serverless Function — OAuth con GitHub para Sveltia CMS (paso 1).
//
//   GET /api/auth?provider=github&site_id=claunet.cl[&scope=public_repo]
//
// Comprueba la petición, crea el testigo anti-CSRF, lo deja en una cookie
// HttpOnly y manda al navegador a la pantalla de permiso de GitHub. GitHub
// devolverá la llamada a /api/callback, que es la «Authorization callback
// URL» registrada en la OAuth App.
//
// Porte a Vercel de `sveltia/sveltia-cms-auth` (Cloudflare Worker, MIT), sin
// dependencias y hablando el mismo protocolo de mensajes que el original.
// Autocontenido a propósito: no importa nada de /api, así que no hay módulos
// compartidos que puedan acabar desplegados como endpoint.
//
// Variables de entorno:
//   GITHUB_CLIENT_ID   obligatoria
//   ALLOWED_DOMAINS    recomendada (p. ej. «claunet.cl,*.claunet.cl»)
// El Client Secret no se lee aquí: solo lo necesita callback.js, así que
// esta función se queda sin acceso al secreto.

const crypto = require('crypto');

const PROVIDER = 'github';
const SCOPE_POR_DEFECTO = 'repo,user';
// Solo se acepta el scope que el CMS pida si está en esta lista blanca: así
// nadie puede usar la función para acuñar un token más ancho de lo necesario.
const SCOPES_PERMITIDOS = ['repo', 'public_repo', 'user', 'read:user', 'user:email'];

/** Escapa texto para incrustarlo en HTML. */
const esc = (v) =>
  String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Serializa un valor como literal de JS seguro dentro de un <script>. */
const js = (v) => JSON.stringify(v === undefined ? null : v).replace(/</g, '\\u003c');

/**
 * Página de error. Avisa al CMS por el mismo canal que un éxito, para que la
 * ventana emergente no se quede colgada: el CMS muestra el mensaje y el
 * `errorCode` en su idioma. Un error no lleva ningún secreto, así que no hace
 * falta filtrar por origen.
 */
const paginaError = ({ error, errorCode }) => {
  const mensaje = `authorization:${PROVIDER}:error:${js({ provider: PROVIDER, error, errorCode })}`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>ClauNet — no se pudo iniciar el acceso</title>
</head>
<body style="font:16px/1.5 system-ui,sans-serif;margin:4rem auto;max-width:36rem;padding:0 1.5rem">
<h1 style="font-size:1.1rem">No se pudo iniciar el acceso</h1>
<p>${esc(error)}${errorCode ? ` <code>(${esc(errorCode)})</code>` : ''}</p>
<p>Puedes cerrar esta ventana.</p>
<script>
(() => {
  const mensaje = ${js(mensaje)};

  window.addEventListener('message', (evento) => {
    if (evento.data !== 'authorizing:${PROVIDER}') {
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

/** Responde con HTML y sin caché (estas páginas nunca deben guardarse). */
const enviarHtml = (res, body, status = 200) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(body);
};

/**
 * Normaliza el valor de `site_id` a un hostname en minúsculas, para aceptar
 * tanto «claunet.cl» como «https://claunet.cl/admin» o «claunet.cl:443».
 * @param {string} valor
 * @returns {string} Hostname.
 */
const aHostname = (valor) =>
  String(valor || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split('/')[0]
    .split('@')
    .pop()
    .split(':')[0];

/**
 * Convierte una entrada de ALLOWED_DOMAINS en una regla anclada. El comodín
 * (`*`) se acepta como en el authenticator original: `*.claunet.cl` cubre
 * cualquier subdominio, pero no el dominio desnudo.
 * @param {string} patron
 * @returns {RegExp}
 */
const aRegla = (patron) =>
  new RegExp(`^${patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.+')}$`);

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Allow', 'GET');
    res.end(JSON.stringify({ error: 'Método no permitido' }));
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host || 'claunet.cl'}`);
  const provider = (url.searchParams.get('provider') || '').toLowerCase();
  const siteId = url.searchParams.get('site_id') || '';
  const scopePedido = url.searchParams.get('scope') || '';

  if (provider !== PROVIDER) {
    enviarHtml(res, paginaError({
      error: 'Your Git backend is not supported by the authenticator.',
      errorCode: 'UNSUPPORTED_BACKEND',
    }));
    return;
  }

  // Scope: se acepta el que pida el CMS solo si todo lo que pide está permitido.
  const pedidos = scopePedido.split(/[\s,]+/).filter(Boolean);
  const scope = pedidos.length && pedidos.every((s) => SCOPES_PERMITIDOS.includes(s))
    ? pedidos.join(',')
    : SCOPE_POR_DEFECTO;

  const clientId = process.env.GITHUB_CLIENT_ID || '';

  if (!clientId) {
    enviarHtml(res, paginaError({
      error: 'OAuth app client ID or secret is not configured.',
      errorCode: 'MISCONFIGURED_CLIENT',
    }));
    return;
  }

  // Anti-abuso: sin lista configurada no se filtra; con lista, el `site_id`
  // tiene que encajar (el token, además, solo se entrega a orígenes de esta
  // misma lista — ver callback.js).
  const reglas = (process.env.ALLOWED_DOMAINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(aRegla);

  if (reglas.length && !reglas.some((regla) => regla.test(aHostname(siteId)))) {
    enviarHtml(res, paginaError({
      error: 'Your domain is not allowed to use the authenticator.',
      errorCode: 'UNSUPPORTED_DOMAIN',
    }));
    return;
  }

  // Testigo anti-CSRF: viaja en el `state` y vuelve en una cookie HttpOnly.
  const testigo = crypto.randomUUID().replace(/-/g, '');
  const authorize = new URLSearchParams({
    client_id: clientId,
    scope,
    state: testigo,
  });

  res.statusCode = 302;
  res.setHeader('Location', `https://github.com/login/oauth/authorize?${authorize}`);
  // Path=/ y SameSite=Lax para que el navegador la mande al volver de GitHub
  // (navegación de nivel superior). Caduca a los 10 minutos.
  res.setHeader(
    'Set-Cookie',
    `csrf-token=${PROVIDER}_${testigo}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.end();
};
