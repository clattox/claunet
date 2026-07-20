// ============================================
// Cookie consent — Ley 21.719
// Se inyecta al final del <body>, igual que el
// script del theme-toggle.
// ============================================

(function () {
  const STORAGE_KEY = "cookie-consent";
  const SITE_NAME = "claunet.cl";

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return; // ya decidió antes, no mostrar de nuevo

  const banner = document.createElement("div");
  banner.className = "cookie-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-live", "polite");
  banner.setAttribute("aria-label", "Consentimiento de cookies");
  banner.innerHTML = `
    <p>
      Usamos cookies para mejorar tu experiencia en el sitio.
      Puedes revisar los detalles en nuestra
      <a href="politica-de-privacidad.html">política de privacidad</a>.
    </p>
    <div class="cookie-actions">
      <button type="button" class="cookie-btn cookie-btn-reject">Rechazar</button>
      <button type="button" class="cookie-btn cookie-btn-accept">Aceptar</button>
    </div>
  `;

  document.body.appendChild(banner);

  function handleChoice(value) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ value: value, timestamp: new Date().toISOString() })
    );

    banner.classList.add("cookie-hidden");
    setTimeout(() => banner.remove(), 300);

    fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: SITE_NAME, consent: value }),
    }).catch(() => {
      // Best-effort: si falla el registro server-side, no bloqueamos
      // la experiencia. El valor ya quedó en localStorage.
    });
  }

  banner
    .querySelector(".cookie-btn-accept")
    .addEventListener("click", () => handleChoice("accepted"));
  banner
    .querySelector(".cookie-btn-reject")
    .addEventListener("click", () => handleChoice("rejected"));
})();
