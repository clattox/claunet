/* ============================================================
   ClauNet — site.js
   Comportamiento compartido de las tres páginas:
     1. Theme toggle (persiste en localStorage)
     2. Aparición progresiva de .reveal (IntersectionObserver)
     3. Fallback de imágenes cuando una preview no carga
     4. Retiro del WhatsApp flotante al llegar al footer
     5. Radio flotante (easter egg Acid Flashback)

   Sin dependencias. El tema se aplica inline en el <head>
   (evita el flash de tema); aquí solo se conecta la interacción.
   ============================================================ */

(function () {
  'use strict';

  // Marca de carga: si este archivo no llega, el guard del <head>
  // quita la clase .js y el contenido queda visible igual.
  window.__claunetReady = true;

  var root = document.documentElement;

  /* ---------- 1. Theme toggle ---------- */
  var toggle = document.getElementById('themeToggle');

  if (toggle) {
    var syncToggle = function (isDark) {
      toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      toggle.setAttribute('aria-label', isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    };

    syncToggle(root.getAttribute('data-theme') === 'dark');

    toggle.addEventListener('click', function () {
      var isDark = root.getAttribute('data-theme') !== 'dark';
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
      try {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
      } catch (e) {
        /* modo privado: el tema funciona igual, solo no persiste */
      }
      syncToggle(isDark);
    });
  }

  /* ---------- 2. Reveal on scroll ---------- */
  var revealables = document.querySelectorAll('.reveal');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!revealables.length) {
    /* nada que animar */
  } else if (reduced || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -4% 0px' });

    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 3. Fallback de imágenes ---------- */
  document.querySelectorAll('.work-media img, .project-preview img').forEach(function (img) {
    img.addEventListener('error', function () {
      if (img.parentElement) { img.parentElement.classList.add('no-img'); }
    });
  });

  /* ---------- 4. WhatsApp flotante ----------
     Se retira mientras el footer está a la vista, así no tapa sus
     enlaces ni los íconos sociales (y deja de competir con el
     contacto cuando ya está en pantalla). El banner de cookies se
     resuelve en CSS, sin JS. */
  var waFloat = document.querySelector('.wa-float');
  var siteFooter = document.querySelector('.site-footer');

  if (waFloat && siteFooter && 'IntersectionObserver' in window) {
    var footerIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        waFloat.classList.toggle('is-hidden', entry.isIntersecting);
      });
    }, { threshold: 0 });

    footerIO.observe(siteFooter);
  }

  /* ---------- 5. Radio flotante — easter egg ----------
     Acid Flashback Radio colgando de la esquina. El stream solo se
     pide después de un clic (el <audio> usa preload="none"), así que
     nada suena al cargar. El estado visual lo dictan los eventos
     reales del <audio> —playing/pause/error— y no el clic: la placa
     nunca dice algo distinto de lo que se oye. Si el stream falla
     (red, formato, CORS), la placa lo avisa y el sitio sigue igual. */
  var radioHang = document.querySelector('.radio-hang');
  var radioToggle = document.getElementById('radioToggle');
  var radioStream = document.getElementById('afrStream');

  if (radioHang && radioToggle && radioStream) {
    var radioNow = 'idle';
    var radioTimer = null;
    var radioFailed = false;

    var radioState = function (state) {
      radioNow = state;
      radioHang.classList.toggle('is-loading', state === 'loading');
      radioHang.classList.toggle('is-live', state === 'live');
      radioHang.classList.toggle('is-error', state === 'error');
      radioToggle.setAttribute('aria-pressed', state === 'live' ? 'true' : 'false');
      radioToggle.setAttribute('aria-label',
        state === 'live' ? 'Pausar Acid Flashback Radio'
          : state === 'loading' ? 'Conectando con Acid Flashback Radio'
            : state === 'error' ? 'Reintentar Acid Flashback Radio'
              : 'Reproducir Acid Flashback Radio');
    };

    var radioClear = function () {
      if (radioTimer) { clearTimeout(radioTimer); radioTimer = null; }
    };

    var radioFail = function () {
      radioClear();
      radioFailed = true;
      radioState('error');
    };

    radioStream.addEventListener('playing', function () {
      radioClear();
      radioFailed = false;
      radioState('live');
    });

    /* solo se vuelve a «detenido» si de verdad estaba sonando o
       conectando: así un pause rezagado no pisa el aviso de error */
    radioStream.addEventListener('pause', function () {
      if (radioNow === 'live' || radioNow === 'loading') {
        radioClear();
        radioState('idle');
      }
    });

    radioStream.addEventListener('error', radioFail);

    radioToggle.addEventListener('click', function () {
      if (!radioStream.paused) {
        radioStream.pause();
        /* un stream en vivo no se reanuda donde quedó: se reconecta */
        if (typeof radioStream.load === 'function') { radioStream.load(); }
        radioClear();
        radioState('idle');
        return;
      }

      /* tras un error el <audio> queda en estado terminal: hay que
         recargarlo antes de reintentar */
      if (radioFailed) {
        radioFailed = false;
        if (typeof radioStream.load === 'function') { radioStream.load(); }
      }

      radioState('loading');
      radioClear();
      radioTimer = setTimeout(radioFail, 8000);

      var attempt = radioStream.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(radioFail);
      }
    });
  }
})();
