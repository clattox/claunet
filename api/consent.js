// api/consent.js
// Vercel Serverless Function — no requiere Next.js, funciona en un
// proyecto estático siempre que el deploy sea vía Vercel.
//
// Registro de consentimiento — Ley 21.719
//
// Persistencia:
//   Por defecto usa console.log (queda en los logs de Vercel).
//   Si configuras las variables de entorno KV_URL, KV_REST_API_URL
//   y KV_REST_API_TOKEN, automáticamente usará Vercel KV (Redis).
//
//   Para activar KV:
//     1. ve a https://vercel.com/clattox/claunet/stores
//     2. crea un KV store y conecta las variables de entorno
//     3. redeploy — no hace falta cambiar nada acá

const crypto = require("crypto");

// KV helper — solo se importa si las variables de entorno existen
let kv;
async function getKv() {
  if (kv) return kv;
  if (process.env.KV_URL) {
    try {
      const { createClient } = require("@vercel/kv");
      kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
    } catch {
      // @vercel/kv no instalado o falló la conexión
      kv = null;
    }
  }
  return kv;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { site, consent } = req.body || {};

  if (!site || !["accepted", "rejected"].includes(consent)) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const ipHash = crypto.createHash("sha256").update(ip).digest("hex");

  const entry = {
    site,
    consent,
    ip_hash: ipHash,
    created_at: new Date().toISOString(),
  };

  // Intento de persistencia vía Vercel KV
  const client = await getKv();
  if (client) {
    try {
      const key = `consent:${ipHash}:${Date.now()}`;
      await client.set(key, JSON.stringify(entry));
      // Expira automáticamente después de 2 años (Ley 21.719)
      await client.expire(key, 63072000);
    } catch (err) {
      console.error("[consent-kv-error]", err.message);
    }
  }

  // Siempre queda en los logs como fallback
  console.log("[consent-log]", entry);

  res.status(200).json({ ok: true });
};
