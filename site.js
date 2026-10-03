/* ============================================================
   ClauNet — site.js
   Comportamiento compartido de las tres páginas:
     1. Theme toggle (persiste en localStorage)
     2. Aparición progresiva de .reveal (IntersectionObserver)
     3. Fallback de imágenes cuando una preview no carga
     4. Retiro del WhatsApp flotante al llegar al footer
     5. Radio flotante (easter egg Acid Flashback)
     6. Carrusel editorial de proyectos (index · #work)

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
     Acid Flashback vive fuera de ClauNet: la placa es un <a> (ya en el
     HTML) que apunta al reproductor oficial de InternetFM, el único
     que puede pedir el stream —la CSP de este sitio solo permite medios
     same-origin, y no se toca—. El JS añade dos cosas, nada más: una
     ventana compacta y reutilizable, y un estado honesto («abriendo
     radio…» → «↗ radio externa»). Si el navegador bloquea la ventana,
     el enlace abre su pestaña y aquí no se finge nada: la placa nunca
     afirma que el audio suene dentro del sitio. */
  var radioHang = document.querySelector('.radio-hang');
  var radioLink = document.getElementById('radioOpen');

  if (radioHang && radioLink) {
    var RADIO_VENTANA = 'acidFlashbackPlayer';
    var RADIO_ANCHO = 420;      /* el ancho para el que está hecho el */
    var RADIO_ALTO = 360;       /* reproductor oficial de InternetFM */
    var RADIO_AVISO = 1200;     /* lo que dura «abriendo radio…», en ms */

    var radioTimer = null;

    var radioState = function (state) {
      radioHang.classList.toggle('is-opening', state === 'opening');
      radioHang.classList.toggle('is-away', state === 'away');
      radioHang.classList.toggle('is-error', state === 'error');
    };

    var radioClear = function () {
      if (radioTimer) { clearTimeout(radioTimer); radioTimer = null; }
    };

    /* abrir dura un parpadeo, y el aviso se queda el tiempo justo para
       poder leerlo antes de pasar a «radio externa». No se adivina si
       la ventana sigue viva —«closed» miente en cuanto el player es
       cross-origin—: si abrió, abrió */
    var radioNotice = function () {
      radioClear();
      radioState('opening');
      radioTimer = setTimeout(function () {
        radioTimer = null;
        radioState('away');
      }, RADIO_AVISO);
    };

    /* ventana propia, pequeña y reutilizable: si el player ya está
       abierto, «window.open('')» devuelve esa misma ventana y solo hay
       que traerla al frente —recargarla cortaría la radio—. Devuelve
       «bloqueada» si el navegador no la deja abrir (manda el enlace) o
       «error» si la abrió y no pudo cargar el player. Va sin
       «noopener» a propósito: sin la referencia no se puede saber si
       abrió ni reenfocarla; el fallback por enlace sí lo lleva. */
    var radioPopup = function () {
      var centrado = 'left=' + Math.max(0, Math.round((screen.availWidth - RADIO_ANCHO) / 2)) +
        ',top=' + Math.max(0, Math.round((screen.availHeight - RADIO_ALTO) / 2));
      var win = null;

      try {
        /* abrir en blanco y navegar después permite reusar una ventana
           que ya exista con este nombre sin recargar el player */
        win = window.open('', RADIO_VENTANA, 'popup=yes,width=' + RADIO_ANCHO +
          ',height=' + RADIO_ALTO + ',' + centrado + ',resizable=yes,scrollbars=yes');
      } catch (err) { win = null; }

      if (!win) { return 'bloqueada'; }

      var cargado = false;
      try { cargado = win.location.href !== 'about:blank'; }
      catch (err) { cargado = true; }   /* cross-origin: ya está el player */

      if (!cargado) {
        try {
          win.location.replace(radioLink.href);
        } catch (err) {
          if (typeof win.close === 'function') { win.close(); }
          return 'error';
        }
      }

      try { win.focus(); } catch (err) { /* sin foco: no es grave */ }
      return 'abierta';
    };

    radioLink.addEventListener('click', function (e) {
      /* clic normal: aquí decidimos nosotros. Teclado (detail 0) y
         clics con modificadores se dejan intactos: los maneja el
         navegador, que sabe si toca pestaña, ventana o descarga */
      var simple = e.button === 0 && e.detail > 0 &&
        !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

      if (simple) {
        var resultado = radioPopup();

        if (resultado === 'abierta') {
          e.preventDefault();
          radioNotice();
          return;
        }

        if (resultado === 'error') {
          e.preventDefault();
          radioClear();
          radioState('error');
          return;
        }
      }

      /* ventana bloqueada, teclado o modificadores: el enlace abre su
         pestaña y la placa solo refleja el estado */
      radioNotice();
    });
  }

  /* ---------- 6. Carrusel editorial de proyectos (index · #work) ----------
     Transforma los .work-entry EXISTENTES en un carrusel que presenta
     un proyecto a la vez: no reescribe el HTML, solo les añade estado
     (.is-active / aria-hidden) y controles. Solo actúa si existe
     [data-carousel]; en el resto de las páginas no hace nada. Sin JS
     la lista queda vertical, como siempre. */
  var carousel = document.querySelector('[data-carousel]');

  if (carousel) {
    var workList = carousel.querySelector('.work-list');
    var slides = workList
      ? Array.prototype.slice.call(workList.querySelectorAll('.work-entry'))
      : [];
    var prevBtn = carousel.querySelector('[data-carousel-prev]');
    var nextBtn = carousel.querySelector('[data-carousel-next]');
    var pauseBtn = carousel.querySelector('[data-carousel-pause]');
    var pauseLabel = carousel.querySelector('[data-carousel-pause-label]');
    var currentEl = carousel.querySelector('[data-carousel-current]');
    var totalEl = carousel.querySelector('[data-carousel-total]');
    var statusEl = carousel.querySelector('[data-carousel-status]');

    var totalSlides = slides.length;

    if (totalSlides > 1) {
      var AUTOPLAY_MS = 7500;
      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };

      var activeIndex = 0;
      /* el autoplay solo se enciende si hay control para pausarlo */
      var playing = !reduceMotion && !!pauseBtn;
      var hovering = false;
      var focused = false;
      var onScreen = false;
      var autoplayTimer = null;

      if (totalEl) { totalEl.textContent = pad(totalSlides); }

      var render = function () {
        for (var i = 0; i < totalSlides; i++) {
          var isActive = i === activeIndex;
          slides[i].classList.toggle('is-active', isActive);
          slides[i].setAttribute('aria-hidden', isActive ? 'false' : 'true');
        }
        if (currentEl) { currentEl.textContent = pad(activeIndex + 1); }
        if (statusEl) {
          statusEl.textContent = 'Proyecto ' + (activeIndex + 1) + ' de ' + totalSlides;
        }
      };

      /* --- autoplay: se re-arma (contador desde cero) en cada gesto --- */
      var stopAutoplay = function () {
        if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
      };

      var armAutoplay = function () {
        stopAutoplay();
        if (!playing || hovering || focused || !onScreen || document.hidden) { return; }
        autoplayTimer = setTimeout(function () {
          activeIndex = (activeIndex + 1) % totalSlides;
          render();
          armAutoplay();
        }, AUTOPLAY_MS);
      };

      var goTo = function (target) {
        activeIndex = ((target % totalSlides) + totalSlides) % totalSlides;
        render();
        armAutoplay();
      };

      var goNext = function () { goTo(activeIndex + 1); };
      var goPrev = function () { goTo(activeIndex - 1); };

      if (prevBtn) { prevBtn.addEventListener('click', goPrev); }
      if (nextBtn) { nextBtn.addEventListener('click', goNext); }

      /* --- teclado ← → mientras el foco está dentro del carrusel --- */
      carousel.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'Left') {
          e.preventDefault(); goPrev();
        } else if (e.key === 'ArrowRight' || e.key === 'Right') {
          e.preventDefault(); goNext();
        }
      });

      /* --- swipe táctil (solo gesto horizontal dominante) --- */
      var touchX = 0;
      var touchY = 0;
      var tracking = false;

      workList.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) { tracking = false; return; }
        touchX = e.touches[0].clientX;
        touchY = e.touches[0].clientY;
        tracking = true;
      }, { passive: true });

      workList.addEventListener('touchend', function (e) {
        if (!tracking) { return; }
        tracking = false;
        var touch = e.changedTouches[0];
        var dx = touch.clientX - touchX;
        var dy = touch.clientY - touchY;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) { goNext(); } else { goPrev(); }
        }
      }, { passive: true });

      /* --- pausas: hover, foco dentro y pestaña en segundo plano --- */
      carousel.addEventListener('mouseenter', function () { hovering = true; armAutoplay(); });
      carousel.addEventListener('mouseleave', function () { hovering = false; armAutoplay(); });
      carousel.addEventListener('focusin', function () { focused = true; armAutoplay(); });
      carousel.addEventListener('focusout', function () { focused = false; armAutoplay(); });

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { stopAutoplay(); } else { armAutoplay(); }
      });

      /* el autoplay solo corre mientras el carrusel está a la vista */
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            onScreen = entry.isIntersecting;
            armAutoplay();
          });
        }, { threshold: 0.5 }).observe(carousel);
      } else {
        onScreen = true;
      }

      /* --- control de pausa (exigencia WCAG 2.2.2) --- */
      if (pauseBtn) {
        var syncPause = function () {
          pauseBtn.setAttribute('aria-pressed', playing ? 'false' : 'true');
          pauseBtn.setAttribute('aria-label', playing
            ? 'Pausar el avance automático de proyectos'
            : 'Reanudar el avance automático de proyectos');
          if (pauseLabel) { pauseLabel.textContent = playing ? 'pausar' : 'reanudar'; }
        };

        /* sin autoplay (reduced-motion) el control no tiene sentido */
        if (reduceMotion) { pauseBtn.hidden = true; }

        pauseBtn.addEventListener('click', function () {
          playing = !playing;
          syncPause();
          if (playing) { armAutoplay(); } else { stopAutoplay(); }
        });

        syncPause();
      }

      carousel.classList.add('is-ready');
      render();
      armAutoplay();
    }
  }
})();
