/* ============================================================
   ClauNet — site.js
   Comportamiento compartido de las tres páginas:
     1. Theme toggle (persiste en localStorage)
     2. Aparición progresiva de .reveal (IntersectionObserver)
     3. Fallback de imágenes cuando una preview no carga

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
})();
