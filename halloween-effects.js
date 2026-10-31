/* ============================================================
   ClauNet — Halloween Special Edition 2026
   Activación y construcción de la capa «ClauNet Haunted Lab».

   Se enciende SOLO durante Halloween, en la zona horaria del sitio:
     · inicio  31/10/2026 00:00  (America/Santiago)
     · fin     01/11/2026 00:00  (America/Santiago)
   El 1 de noviembre la clase `halloween-active` se retira y los
   nodos creados se eliminan: no queda rastro en el documento.

   Sin localStorage, sin dependencias y sin tocar el HTML permanente:
   todo se construye aquí y se apoya en halloween-effects.css.

   Previsualización de desarrollo (no altera las fechas):
     ?halloween=preview   enciende los efectos ahora
     ?halloween=off       los apaga dentro de la ventana real

   Para retirar la temporada: borrar este archivo, la hoja
   halloween-effects.css y sus dos etiquetas en cada página.
   ============================================================ */

(function () {
  'use strict';

  var root = document.documentElement;
  var TZ = 'America/Santiago';

  /* ventana de la temporada: 31/10/2026 00:00 → 01/11/2026 00:00 */
  var INICIO = { y: 2026, m: 10, d: 31 };
  var FIN = { y: 2026, m: 11, d: 1 };

  /* parámetros de desarrollo: nunca modifican las fechas reales */
  var params = null;
  try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }
  var modo = params ? params.get('halloween') : null;
  if (modo === 'off') { return; }
  var preview = modo === 'preview';

  var reducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  /* ---------- Ventana horaria ---------- */
  /* La zona se resuelve con Intl, no con la hora del equipo: así el
     cambio ocurre a medianoche en Chile aunque el visitante esté en
     otro huso. Si Intl no ofrece zonas horarias se cae a UTC-3, que
     es el horario de verano austral vigente en esas fechas. */
  var fmtZona = null;
  try {
    fmtZona = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch (e) {
    fmtZona = null;
  }

  var partesZona = function (ms) {
    var lista = fmtZona.formatToParts(new Date(ms));
    var p = {};
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].type !== 'literal') { p[lista[i].type] = lista[i].value; }
    }
    var h = parseInt(p.hour, 10);
    return {
      y: parseInt(p.year, 10),
      m: parseInt(p.month, 10),
      d: parseInt(p.day, 10),
      h: h === 24 ? 0 : h,
      min: parseInt(p.minute, 10),
      s: parseInt(p.second, 10)
    };
  };

  var offsetZona = function (ms) {
    var p = partesZona(ms);
    var comoUTC = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    return comoUTC - Math.floor(ms / 1000) * 1000;
  };

  var msEnZona = function (fecha) {
    var pared = Date.UTC(fecha.y, fecha.m - 1, fecha.d, 0, 0, 0);
    if (!fmtZona) { return pared + 3 * 60 * 60 * 1000; }

    var off = offsetZona(pared);
    var t = pared - off;
    /* segunda lectura: si la fecha cayera en un salto de horario,
       el offset correcto es el del instante ya corregido */
    off = offsetZona(t);
    return pared - off;
  };

  var inicioMs = msEnZona(INICIO);
  var finMs = msEnZona(FIN);

  var enVentana = function () {
    var ahora = Date.now();
    return ahora >= inicioMs && ahora < finMs;
  };

  /* ---------- Piezas SVG ---------- */
  /* Siluetas dibujadas a mano, del mismo trazo menudo que el resto
     del sitio. Heredan el color de su contenedor con currentColor. */

  var GHOST_SVG =
    '<svg viewBox="0 0 100 84" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="halloween-ghost-fill" x1="0" y1="0" x2="0.35" y2="1">' +
          '<stop offset="0" stop-color="#ffffff"/>' +
          '<stop offset="0.55" stop-color="#eef7ff"/>' +
          '<stop offset="1" stop-color="#cfe4ff"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<path class="halloween-ghost__body" fill="url(#halloween-ghost-fill)" d="M10,61 C3,54 1,45 5,37 C8,30 14,25 21,23 C20,12 28,4 39,4 C46,4 52,8 56,14 C59,8 66,4 74,4 C85,4 94,13 94,25 C94,27 94,28 93,30 C97,34 99,39 99,44 C99,52 95,58 90,62 C94,66 94,72 90,76 C86,80 81,77 79,72 C75,77 69,80 64,77 C59,74 58,69 56,66 C51,71 44,74 39,70 C34,66 34,62 33,59 C27,63 18,64 10,61 Z"/>' +
      '<g>' +
        '<ellipse cx="40" cy="38" rx="4.4" ry="5.4" fill="#123a72"/>' +
        '<ellipse cx="60" cy="38" rx="4.4" ry="5.4" fill="#123a72"/>' +
        '<circle cx="41.5" cy="36.2" r="1.4" fill="#ffffff"/>' +
        '<circle cx="61.5" cy="36.2" r="1.4" fill="#ffffff"/>' +
        '<ellipse cx="50" cy="50" rx="3.6" ry="4.4" fill="#123a72" opacity="0.9"/>' +
        '<ellipse cx="36" cy="46.5" rx="3" ry="1.5" fill="#9fd0ff" opacity="0.55"/>' +
        '<ellipse cx="64" cy="46.5" rx="3" ry="1.5" fill="#9fd0ff" opacity="0.55"/>' +
      '</g>' +
    '</svg>';

  var BAT_SVG =
    '<svg viewBox="0 0 72 30" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      '<path fill="currentColor" d="M36 6.5c2.3 0 4.2 1.3 5.2 3.4 1.1-1.7 2.7-2.9 4.6-3.3-1.4 1.2-1.9 2.6-1.6 4.3 3.1-2.6 7-3.4 11.2-2.2 4.7 1.3 8.7 4.8 11.6 9.5-5.1-1.4-9.5-1-12.8 1.3 4 .9 7.3 3.3 9.6 7.2-5.3-1.9-10.1-1.6-14.2 1-4-3.2-8.7-4.8-13.6-4.8s-9.6 1.6-13.6 4.8c-4.1-2.6-8.9-2.9-14.2-1 2.3-3.9 5.6-6.3 9.6-7.2-3.3-2.3-7.7-2.7-12.8-1.3 2.9-4.7 6.9-8.2 11.6-9.5 4.2-1.2 8.1-.4 11.2 2.2.3-1.7-.2-3.1-1.6-4.3 1.9.4 3.5 1.6 4.6 3.3C31.8 7.8 33.7 6.5 36 6.5z"/>' +
    '</svg>';

  var PUMPKIN_SVG =
    '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      '<path d="M31 17c-1-5 1.2-8.4 5.4-10.2.6 3.8-1.2 6.9-4.2 8.8" fill="none" stroke="#4b7c3a" stroke-width="3" stroke-linecap="round"/>' +
      '<ellipse cx="20" cy="40" rx="11" ry="16" fill="currentColor" opacity="0.82"/>' +
      '<ellipse cx="44" cy="40" rx="11" ry="16" fill="currentColor" opacity="0.82"/>' +
      '<ellipse cx="32" cy="40" rx="13" ry="17" fill="currentColor"/>' +
      '<ellipse cx="26" cy="33" rx="4" ry="7" fill="#ffffff" opacity="0.16"/>' +
      '<path d="M21 35l7 0-3.5 5.6z" fill="#3a2208"/>' +
      '<path d="M36 35l7 0-3.5 5.6z" fill="#3a2208"/>' +
      '<path d="M23 46c2.6 3.2 5.7 4.8 9 4.8s6.4-1.6 9-4.8" fill="none" stroke="#3a2208" stroke-width="2.4" stroke-linecap="round"/>' +
    '</svg>';

  var SPIDER_SVG =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      '<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
        '<path d="M12 9c-2-3-4-4-7-4M12 11c-3-1-5 0-7 2M12 13c-3 0-5 1-6 4M12 15c-2 1-3 2-4 4"/>' +
        '<path d="M12 9c2-3 4-4 7-4M12 11c3-1 5 0 7 2M12 13c3 0 5 1 6 4M12 15c2 1 3 2 4 4"/>' +
      '</g>' +
      '<ellipse cx="12" cy="13" rx="3.2" ry="4.2" fill="currentColor"/>' +
    '</svg>';

  var SPARK_SVG =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      '<path fill="currentColor" d="M12 0c1.2 8.4 3.6 10.8 12 12-8.4 1.2-10.8 3.6-12 12-1.2-8.4-3.6-10.8-12-12C8.4 10.8 10.8 8.4 12 0z"/>' +
    '</svg>';

  var WEB_SVG =
    '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      '<g fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round">' +
        '<path d="M0 0L40 0M0 0L34 20M0 0L20 34M0 0L0 40"/>' +
        '<path d="M10 1Q14 6 7 9"/>' +
        '<path d="M18 2Q24 10 12 15"/>' +
        '<path d="M27 4Q30 16 15 22"/>' +
        '<path d="M36 6Q34 21 19 30"/>' +
      '</g>' +
    '</svg>';

  var crear = function (tag, clase) {
    var n = document.createElement(tag);
    if (clase) { n.className = clase; }
    n.setAttribute('aria-hidden', 'true');
    n.setAttribute('data-halloween', '');
    return n;
  };

  /* ---------- Construcción de la decoración ---------- */

  /* A. el logo: la nube fantasma se monta ENCIMA del isotipo
     original. El marcado no se modifica; el CSS solo oculta mientras
     dura la capa las tres elipses de la base del isotipo (las lomas
     que asomarían por el faldón). Al retirar la capa el logo vuelve a
     quedar como estaba, sin huérfanos ni estilos residuales. */
  var construirLogo = function () {
    var logo = document.querySelector('.nav-logo');
    if (!logo || logo.querySelector('.halloween-ghost')) { return; }

    var fantasma = crear('span', 'halloween-ghost');
    fantasma.innerHTML = GHOST_SVG;
    logo.appendChild(fantasma);

    var globo = crear('span', 'halloween-ghost-bubble');
    globo.textContent = '¡Buuu! ¿Qué construimos hoy?';
    logo.appendChild(globo);
  };

  /* B–E. el hero: un solo contenedor a sangre, recortado por CSS,
     con murciélagos, calabaza, araña, destellos y telaraña. */
  var construirHero = function () {
    var hero = document.querySelector('.hero');
    if (!hero || hero.querySelector('.halloween-hero')) { return; }

    var capa = crear('div', 'halloween-hero');
    capa.innerHTML =
      '<div class="halloween-bats">' +
        '<span class="halloween-bat halloween-bat--1">' + BAT_SVG + '</span>' +
        '<span class="halloween-bat halloween-bat--2">' + BAT_SVG + '</span>' +
        '<span class="halloween-bat halloween-bat--3">' + BAT_SVG + '</span>' +
      '</div>' +
      '<div class="halloween-pumpkin">' + PUMPKIN_SVG + '</div>' +
      '<div class="halloween-spider">' +
        '<span class="halloween-spider-thread"></span>' + SPIDER_SVG +
      '</div>' +
      '<span class="halloween-spark halloween-spark--a">' + SPARK_SVG + '</span>' +
      '<span class="halloween-spark halloween-spark--b">' + SPARK_SVG + '</span>' +
      '<span class="halloween-spark halloween-spark--c">' + SPARK_SVG + '</span>' +
      '<span class="halloween-web halloween-web--hero">' + WEB_SVG + '</span>';

    hero.appendChild(capa);
  };

  /* C. la radio: telaraña en la nube y nota ocasional. La URL, el
     enlace y el estado del reproductor no se tocan: la nota es un
     nodo aparte, aria-hidden y sin acción. */
  var construirRadio = function () {
    var placa = document.querySelector('.radio-hang .radio-plate');
    if (!placa || placa.querySelector('.halloween-radio-web')) { return; }

    var tela = crear('span', 'halloween-radio-web');
    tela.innerHTML = WEB_SVG;
    placa.appendChild(tela);
  };

  var construirNota = function () {
    var colgante = document.querySelector('.radio-hang');
    if (!colgante || colgante.querySelector('.halloween-radio-note')) { return; }

    var nota = crear('span', 'halloween-radio-note');
    nota.textContent = 'Esta noche hay interferencias…';
    colgante.appendChild(nota);
  };

  /* ---------- Nota ocasional de la radio ---------- */
  var notaTimer = null;

  var limpiarNota = function () {
    if (notaTimer) {
      clearTimeout(notaTimer);
      notaTimer = null;
    }
    var visible = document.querySelector('.halloween-radio-note--visible');
    if (visible) { visible.classList.remove('halloween-radio-note--visible'); }
  };

  var programarNota = function () {
    limpiarNota();
    if (reducedMotion.matches) { return; }
    if (!root.classList.contains('halloween-active')) { return; }

    var colgante = document.querySelector('.radio-hang');
    var nota = document.querySelector('.halloween-radio-note');
    if (!colgante || !nota) { return; }

    /* en producción aparece pasados unos segundos y luego cada
       minuto largo; en preview, antes, para poder revisarla */
    var espera = preview ? 2200 : 16000 + Math.random() * 14000;

    var mostrar = function () {
      if (!root.classList.contains('halloween-active')) { return; }

      /* nunca se superpone al estado real del reproductor */
      var libre = !colgante.classList.contains('is-opening') &&
                  !colgante.classList.contains('is-away') &&
                  !colgante.classList.contains('is-error');

      if (libre) {
        nota.classList.add('halloween-radio-note--visible');
        setTimeout(function () {
          nota.classList.remove('halloween-radio-note--visible');
        }, preview ? 6000 : 4600);
      }

      notaTimer = setTimeout(
        mostrar,
        (preview ? 10000 : 30000) + Math.random() * 14000
      );
    };

    notaTimer = setTimeout(mostrar, espera);
  };

  /* ---------- Montaje y desmontaje ---------- */

  var montar = function () {
    if (root.classList.contains('halloween-active')) { return; }

    root.classList.add('halloween-active');
    construirLogo();
    construirHero();
    construirRadio();
    construirNota();
    programarNota();
  };

  var desmontar = function () {
    limpiarNota();
    root.classList.remove('halloween-active');

    /* todo lo decorativo lleva data-halloween: un solo barrido y no
       queda ni un nodo, ni un listener, ni una clase */
    var nodos = document.querySelectorAll('[data-halloween]');
    for (var i = nodos.length - 1; i >= 0; i--) {
      if (nodos[i].parentNode) { nodos[i].parentNode.removeChild(nodos[i]); }
    }
  };

  /* id del reloj de respaldo; se guarda para poder apagarlo cuando la
     temporada termina y no dejar un temporizador vivo el resto del año */
  var tickId = null;

  var revisar = function () {
    if (preview || enVentana()) {
      montar();
    } else {
      desmontar();

      /* pasada la ventana ya no hay nada que vigilar: fuera del modo
         preview el reloj se detiene y la página queda en silencio */
      if (!preview && tickId !== null && Date.now() > finMs) {
        clearInterval(tickId);
        tickId = null;
      }
    }
  };

  /* Los límites se programan en hora local de Chile, de modo que el
     cambio ocurre a medianoche aunque la pestaña lleve horas abierta.
     Para esperas largas se encadenan tramos (setTimeout no admite más
     de ~24,8 días de una vez). */
  var programar = function (fn, ms) {
    if (ms <= 0) { fn(); return; }
    var max = 2147483000;
    if (ms > max) {
      setTimeout(function () { programar(fn, ms - max); }, max);
      return;
    }
    setTimeout(fn, ms);
  };

  revisar();

  if (!preview) {
    var ahora = Date.now();
    if (ahora < inicioMs) {
      programar(revisar, inicioMs - ahora + 500);
    } else if (ahora < finMs) {
      programar(revisar, finMs - ahora + 500);
    }
  }

  /* respaldo barato: pestañas dormidas, equipos que despiertan con la
     hora ya cambiada o relojes corregidos a mitad de sesión. Pasada la
     temporada no se enciende siquiera: la página queda sin temporizadores. */
  if (!preview && Date.now() < finMs) {
    tickId = setInterval(revisar, 60000);
  }

  /* si la preferencia de movimiento cambia con la página abierta, la
     nota ocasional se detiene o se retoma sin recargar */
  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', function () {
      if (!root.classList.contains('halloween-active')) { return; }
      if (reducedMotion.matches) {
        limpiarNota();
      } else {
        programarNota();
      }
    });
  }
})();



