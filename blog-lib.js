/* ============================================================
   ClauNet — núcleo del blog (compartido)
   Lo cargan blog.html (listado → blog.js) y articulo.html
   (página de artículo → articulo.js). Reúne lo que ambas páginas
   necesitan y no depende del DOM de una en concreto:

     · carga de texto y codificación de rutas del CMS,
     · lectura del frontmatter (el YAML mínimo que escribe Sveltia),
     · fechas en español compuestas a mano,
     · render de Markdown a nodos DOM, sin librerías.

   Se publica como window.ClauBlog. La regla de la casa se respeta
   también al interpretar Markdown: todo el texto del CMS entra por
   textContent/createElement, nunca por innerHTML, así que un carácter
   raro (o malintencionado) no puede inyectar marcado. El único
   innerHTML del blog sigue siendo el SVG estático de la portada de
   reserva.
   ============================================================ */

(function () {
  'use strict';

  var MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  /* ---------- utilidades ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function fetchText(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) {
        var err = new Error(url + ' → HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.text();
    });
  }

  /* Los nombres que escribe el CMS llevan acentos y espacios —«Collage
     cósmico tributo a Pink Floyd.png»—: se codifica tramo a tramo para
     que el navegador pida exactamente el fichero que existe. Se dejan
     intactos los caracteres ya seguros (incluido «%», por si la ruta ya
     viniera codificada) y las URL absolutas. */
  function encodePath(value) {
    if (!value) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
    return value.split('/').map(function (part) {
      return part.replace(/[^A-Za-z0-9\-_.~!$&'()*+,;=:@%]/g, function (ch) {
        return encodeURIComponent(ch);
      });
    }).join('/');
  }

  function unquote(value) {
    var v = String(value).trim();
    if (v.length > 1 && ((v.charAt(0) === "'" && v.slice(-1) === "'") ||
                         (v.charAt(0) === '"' && v.slice(-1) === '"'))) {
      return v.slice(1, -1).replace(/''/g, "'");
    }
    return v;
  }

  /* ---------- frontmatter (YAML mínimo, a mano) ----------
     Cubre lo que escribe Sveltia en este proyecto:

       title: 'Pink Floyd: de la psicodelia al último corte'
       date: 2026-10-04T14:33:00-03:00
       category: Música
       tags:
         - Pink Floyd, Syd Barrett, …
       cover: /previews/blog/Collage cósmico tributo a Pink Floyd.png

     O sea: escalares con o sin comillas, listas de bloque con «- » y
     listas en línea [a, b]. No pretende ser un parser YAML completo. */
  function parseFrontmatter(raw) {
    var data = {};
    if (raw.slice(0, 3) !== '---') return { data: data, body: raw };

    var end = raw.indexOf('\n---', 3);
    var block = end === -1 ? raw.slice(3) : raw.slice(3, end);
    var bodyStart = end === -1 ? -1 : raw.indexOf('\n', end + 1);
    var body = bodyStart === -1 ? '' : raw.slice(bodyStart + 1);

    var lines = block.split(/\r?\n/);
    var listKey = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim() || line.trim().charAt(0) === '#') continue;

      var item = /^\s+-\s*(.*)$/.exec(line);
      if (item && listKey) {
        if (!Array.isArray(data[listKey])) data[listKey] = [];
        data[listKey].push(unquote(item[1]));
        continue;
      }

      var pair = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
      if (!pair) continue;

      var key = pair[1];
      var value = pair[2].trim();

      if (value === '' || value === '|' || value === '>') {
        data[key] = '';
        listKey = key;            // puede venir una lista debajo
        continue;
      }

      listKey = null;
      if (value.charAt(0) === '[' && value.slice(-1) === ']') {
        data[key] = value.slice(1, -1).split(',').map(unquote);
      } else {
        data[key] = unquote(value);
      }
    }

    return { data: data, body: body };
  }

  /* Sveltia escribe la lista simple con un campo por elemento, pero el
     texto pegado con comas cae entero en el primero. Se aceptan las dos
     formas —y las dos a la vez— separando también por comas. */
  function tagsOf(value) {
    var raw = Array.isArray(value) ? value : (value ? [value] : []);
    var out = [];
    raw.forEach(function (entry) {
      String(entry).split(',').forEach(function (tag) {
        var t = tag.trim();
        if (t && out.indexOf(t) === -1) out.push(t);
      });
    });
    return out;
  }

  /* «4 de octubre de 2026». Se compone a mano desde el propio ISO en
     lugar de usar toLocaleDateString: el frontmatter trae desfase
     horario (-03:00) y un visitante en otro huso vería el día corrido.
     Leyendo YYYY-MM-DD tal cual, la fecha que se ve es la que el autor
     escribió en el panel. */
  function formatDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (!m) return '';
    var mes = MESES[parseInt(m[2], 10) - 1];
    if (!mes) return '';
    return parseInt(m[3], 10) + ' de ' + mes + ' de ' + m[1];
  }

  function timeOf(post) {
    var t = Date.parse(post.date);
    return isNaN(t) ? 0 : t;
  }

  function humanize(slug) {
    return String(slug || '').replace(/[-_]+/g, ' ').replace(/^\w/, function (c) {
      return c.toUpperCase();
    });
  }

  /* El frontmatter del .md, normalizado a un objeto que consumen tanto
     las tarjetas del listado como la ficha del artículo. El slug es el
     nombre del fichero sin la extensión. */
  function postFrom(file, raw) {
    var data = parseFrontmatter(raw).data;
    var slug = String(file).replace(/\.md$/i, '');
    return {
      file: file,
      slug: slug,
      title: typeof data.title === 'string' ? data.title.trim() : '',
      date: typeof data.date === 'string' ? data.date.trim() : '',
      category: typeof data.category === 'string' ? data.category.trim() : '',
      excerpt: typeof data.excerpt === 'string' ? data.excerpt.trim() : '',
      cover: typeof data.cover === 'string' ? data.cover.trim() : '',
      tags: tagsOf(data.tags)
    };
  }

  /* ---------- aparición progresiva ----------
     site.js lanza su observador de .reveal al cargar el documento, antes
     de que estas tarjetas/fichas existan. Aquí se repite el mismo patrón
     para los nodos creados después: aparecen al entrar en pantalla y, con
     prefers-reduced-motion (o sin IntersectionObserver), se muestran de
     golpe. */
  function revealAll(nodes) {
    if (!nodes.length) return;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || !('IntersectionObserver' in window)) {
      nodes.forEach(function (node) { node.classList.add('in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    nodes.forEach(function (node) { io.observe(node); });
  }

  /* ---------- portada de reserva ----------
     Sin portada, o portada que no carga: la nube del logotipo —el mismo
     <path> que el nav, en versión reducida— sobre --bg2. Nunca un icono
     de imagen rota. El prefijo de clase lo pone quien llama: las tarjetas
     usan «blog-card» y la ficha «article». El marcado es estático, así
     que innerHTML es seguro aquí (nada del CMS pasa por él). */
  function placeholder(prefix) {
    prefix = prefix || 'blog-card';
    var wrap = el('span', prefix + '__placeholder');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<svg class="' + prefix + '__cloud" viewBox="0 0 106 66" focusable="false" aria-hidden="true">' +
      '<path d="M28,58 C18,58 10,50 10,41 C10,33 15,26 23,24 C23,14 31,7 41,7 C47,7 52,10 56,14 ' +
      'C59,9 65,6 72,6 C83,6 92,15 92,26 C92,27 92,28 91,29 C96,31 100,37 100,43 C100,51 93,58 85,58 Z" ' +
      'fill="currentColor"/></svg>' +
      '<span class="' + prefix + '__placeholder-label">// ClauNet</span>';
    return wrap;
  }

  /* ---------- Markdown → DOM ----------
     Subconjunto que escribe el blog, sin librerías y sin innerHTML:

       # ## ###    encabezados (# → h2: el h1 es el título del artículo)
       **negrita** / __negrita__      _cursiva_ / *cursiva*
       `código` y bloques ``` … ```
       [texto](url) · > cita · - viñetas · 1. listas numeradas
       --- / *** / ___   separador

     El árbol se construye con createElement/createTextNode, así que el
     texto entra escapado por construcción. */

  /* Esquema de un enlace. Si el autor escribe un esquema, solo se admiten
     los inocuos; una ruta relativa o un ancla pasan tal cual. Así un
     `javascript:` o un `data:` escrito en el .md no puede colarse. */
  function safeUrl(value) {
    var url = String(value == null ? '' : value).trim();
    if (!url) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      return /^(https?|mailto|tel):/i.test(url) ? url : '';
    }
    return url;
  }

  var INLINE_RE = /(\*\*|__)([\s\S]+?)\1|(\*|_)([\s\S]+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/;

  /* Elemento con un único hijo (que puede ser un fragmento). */
  function element(tag, child) {
    var node = document.createElement(tag);
    node.appendChild(child);
    return node;
  }

  /* Trocea un tramo de texto y devuelve un DocumentFragment con los nodos
     ya formateados (negrita, cursiva, código, enlaces). */
  function inline(text) {
    var frag = document.createDocumentFragment();
    var rest = String(text == null ? '' : text);
    var m;

    while ((m = INLINE_RE.exec(rest))) {
      if (m.index > 0) frag.appendChild(document.createTextNode(rest.slice(0, m.index)));

      if (m[1] != null) {
        frag.appendChild(element('strong', inline(m[2])));
      } else if (m[3] != null) {
        frag.appendChild(element('em', inline(m[4])));
      } else if (m[5] != null) {
        frag.appendChild(element('code', document.createTextNode(m[5])));
      } else if (m[6] != null) {
        var url = safeUrl(m[7]);
        if (!url) {
          frag.appendChild(inline(m[6]));   // enlace no seguro → solo el texto
        } else {
          var a = document.createElement('a');
          a.href = url;
          if (/^https?:/i.test(url)) {
            a.target = '_blank';
            a.rel = 'noopener';
          }
          a.appendChild(inline(m[6]));
          frag.appendChild(a);
        }
      }

      rest = rest.slice(m.index + m[0].length);
    }

    if (rest) frag.appendChild(document.createTextNode(rest));
    return frag;
  }

  var HR_RE = /^\s{0,3}([-*_])\s*(\1\s*){2,}$/;

  /* Bloque a bloque. Devuelve un DocumentFragment con el artículo entero. */
  function renderMarkdown(markdown) {
    var frag = document.createDocumentFragment();
    var lines = String(markdown == null ? '' : markdown).replace(/\r\n?/g, '\n').split('\n');
    var para = [];
    var i = 0;

    function flush() {
      if (!para.length) return;
      frag.appendChild(element('p', inline(para.join(' '))));
      para = [];
    }

    while (i < lines.length) {
      var line = lines[i];

      /* Encabezados */
      var heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) {
        flush();
        var level = Math.min(heading[1].length + 1, 6);   // # → h2
        frag.appendChild(element('h' + level, inline(heading[2].trim())));
        i++;
        continue;
      }

      /* Bloque de código ``` … ``` */
      if (/^\s*```/.test(line)) {
        flush();
        var code = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
          code.push(lines[i]);
          i++;
        }
        i++;   // consume el cierre (si existe)
        frag.appendChild(element('pre', element('code', document.createTextNode(code.join('\n')))));
        continue;
      }

      /* Separador --- *** ___ */
      if (HR_RE.test(line)) {
        flush();
        frag.appendChild(document.createElement('hr'));
        i++;
        continue;
      }

      /* Cita > … */
      if (/^\s*>/.test(line)) {
        flush();
        var quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        frag.appendChild(element('blockquote', inline(quote.join(' '))));
        continue;
      }

      /* Lista con viñetas */
      if (/^\s*[-*+]\s+/.test(line)) {
        flush();
        var ul = document.createElement('ul');
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          ul.appendChild(element('li', inline(lines[i].replace(/^\s*[-*+]\s+/, ''))));
          i++;
        }
        frag.appendChild(ul);
        continue;
      }

      /* Lista numerada */
      if (/^\s*\d+[.)]\s+/.test(line)) {
        flush();
        var ol = document.createElement('ol');
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          ol.appendChild(element('li', inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))));
          i++;
        }
        frag.appendChild(ol);
        continue;
      }

      /* Línea en blanco → cierra el párrafo en curso */
      if (!line.trim()) {
        flush();
        i++;
        continue;
      }

      /* Texto normal → se acumula al párrafo */
      para.push(line.trim());
      i++;
    }

    flush();
    return frag;
  }

  window.ClauBlog = {
    MESES: MESES,
    el: el,
    fetchText: fetchText,
    encodePath: encodePath,
    unquote: unquote,
    parseFrontmatter: parseFrontmatter,
    tagsOf: tagsOf,
    formatDate: formatDate,
    timeOf: timeOf,
    humanize: humanize,
    postFrom: postFrom,
    revealAll: revealAll,
    placeholder: placeholder,
    renderMarkdown: renderMarkdown
  };
})();
