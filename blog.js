/* ============================================================
   ClauNet — blog
   1. Lee content/blog/index.json, la lista de artículos que mantiene
      scripts/build-blog-index.mjs (un sitio estático no puede listar
      directorios, así que el índice es un fichero real del repo).
   2. Descarga cada .md y lee su frontmatter a mano —el subconjunto de
      YAML que escribe Sveltia—, sin librerías.
   3. Pinta las tarjetas ordenadas por fecha.

   El .md es la única fuente de verdad: el índice solo lleva nombres de
   fichero. Todo el texto del CMS entra por textContent, nunca por
   innerHTML, así que un carácter raro (o malicioso) no puede inyectar
   marcado.
   ============================================================ */

(function () {
  'use strict';

  var INDEX_URL = 'content/blog/index.json';
  var BLOG_URL = 'content/blog/';

  /* La página individual del artículo todavía no existe. Cuando exista,
     se pone aquí su ruta con {slug} y las tarjetas se vuelven enlaces
     de verdad (título + «Leer →»):
        var ARTICLE_URL = 'articulo.html?slug={slug}';
     No hay que tocar nada más. */
  var ARTICLE_URL = null;

  var MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  var grid = document.getElementById('blogGrid');
  var status = document.getElementById('blogStatus');
  if (!grid) return;

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

  /* ---------- tarjetas ---------- */

  /* Sin portada, o portada que no carga: la nube del logotipo —el mismo
     <path> que el nav, en versión reducida— sobre --bg2. Nunca un icono
     de imagen rota. El marcado es estático, así que innerHTML es seguro
     aquí (nada del CMS pasa por él). */
  function placeholder() {
    var wrap = el('span', 'blog-card__placeholder');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<svg class="blog-card__cloud" viewBox="0 0 106 66" focusable="false" aria-hidden="true">' +
      '<path d="M28,58 C18,58 10,50 10,41 C10,33 15,26 23,24 C23,14 31,7 41,7 C47,7 52,10 56,14 ' +
      'C59,9 65,6 72,6 C83,6 92,15 92,26 C92,27 92,28 91,29 C96,31 100,37 100,43 C100,51 93,58 85,58 Z" ' +
      'fill="currentColor"/></svg>' +
      '<span class="blog-card__placeholder-label">// ClauNet</span>';
    return wrap;
  }

  function buildCard(post, index) {
    var card = el('article', 'blog-card reveal');
    card.style.setProperty('--reveal-delay', (Math.min(index, 6) * 0.05).toFixed(2) + 's');

    var media = el('div', 'blog-card__media');
    var title = post.title || humanize(post.slug);

    if (post.cover) {
      var img = document.createElement('img');
      img.src = encodePath(post.cover);
      img.alt = 'Portada: ' + title;
      img.loading = 'lazy';
      img.decoding = 'async';
      /* Si la portada no existe o no carga, se cae al mismo recurso que
         un artículo sin imagen: la tarjeta nunca muestra una imagen rota. */
      img.addEventListener('error', function () {
        if (!media.classList.contains('is-empty')) {
          media.classList.add('is-empty');
          media.appendChild(placeholder());
        }
      });
      media.appendChild(img);
    } else {
      media.classList.add('is-empty');
      media.appendChild(placeholder());
    }

    var body = el('div', 'blog-card__body');

    if (post.category) body.appendChild(el('p', 'blog-card__cat', post.category));

    var heading = el('h2', 'blog-card__title');
    if (ARTICLE_URL) {
      var link = el('a', null, title);
      link.href = ARTICLE_URL.replace('{slug}', encodeURIComponent(post.slug));
      heading.appendChild(link);
    } else {
      heading.textContent = title;
    }
    body.appendChild(heading);

    var fecha = formatDate(post.date);
    if (fecha) body.appendChild(el('p', 'blog-card__date', fecha));

    if (post.excerpt) body.appendChild(el('p', 'blog-card__excerpt', post.excerpt));

    if (post.tags.length) {
      var visibles = post.tags.slice(0, 3);
      var resto = post.tags.length - visibles.length;
      body.appendChild(el('p', 'blog-card__tags',
        visibles.join(' · ') + (resto > 0 ? ' · +' + resto : '')));
    }

    /* «Leer →». Sin página de artículo todavía no es un enlace: va en
       tono apagado y oculto para lectores de pantalla, para no prometer
       algo que aún no existe. */
    var moreIsLink = !!ARTICLE_URL;
    var more = el(moreIsLink ? 'a' : 'span',
      'blog-card__more' + (moreIsLink ? '' : ' is-disabled'));
    if (moreIsLink) {
      more.href = ARTICLE_URL.replace('{slug}', encodeURIComponent(post.slug));
    } else {
      more.setAttribute('aria-hidden', 'true');
    }
    more.appendChild(document.createTextNode('Leer '));
    more.appendChild(el('span', 'blog-card__arrow', '→'));
    body.appendChild(more);

    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  /* site.js ya lanzó su observador de .reveal antes de que existan estas
     tarjetas, así que aquí se repite el mismo patrón para las nuevas:
     aparecen al entrar en pantalla y, con prefers-reduced-motion (o sin
     IntersectionObserver), se muestran de golpe. */
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

  /* ---------- estados y pintado ---------- */

  function setState(message) {
    grid.innerHTML = '';
    grid.removeAttribute('aria-busy');
    grid.appendChild(el('p', 'blog-state', message));
  }

  function renderPosts(posts) {
    grid.innerHTML = '';
    grid.removeAttribute('aria-busy');

    var frag = document.createDocumentFragment();
    posts.forEach(function (post, i) { frag.appendChild(buildCard(post, i)); });
    grid.appendChild(frag);

    revealAll(Array.prototype.slice.call(grid.querySelectorAll('.reveal')));

    if (status) {
      status.textContent = posts.length === 1 ? '1 artículo' : posts.length + ' artículos';
    }
  }

  /* ---------- lectura ---------- */

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

  /* El índice es un array de nombres; se aceptan también objetos
     ({ file: … }) por si algún día el script guarda más datos. */
  function namesFrom(index) {
    var list = Array.isArray(index) ? index
      : (index && Array.isArray(index.posts) ? index.posts : []);

    return list.map(function (item) {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.file || item.path || item.filename || '';
      return '';
    }).filter(function (name) {
      return name && /\.md$/i.test(name) && name.charAt(0) !== '.';
    });
  }

  fetchText(INDEX_URL)
    .then(function (raw) { return JSON.parse(raw); })
    .then(function (index) {
      var names = namesFrom(index);

      return Promise.all(names.map(function (name) {
        return fetchText(BLOG_URL + encodePath(name))
          .then(function (raw) { return postFrom(name, raw); })
          .catch(function (err) {
            console.warn('blog: no se pudo leer ' + name, err);
            return null;             // un artículo roto no tumba el listado
          });
      })).then(function (posts) {
        return { names: names, posts: posts.filter(Boolean) };
      });
    })
    .then(function (result) {
      result.posts.sort(function (a, b) {
        return timeOf(b) - timeOf(a) || a.slug.localeCompare(b.slug, 'es');
      });

      if (!result.posts.length) {
        setState(result.names.length
          ? 'No se pudieron leer los artículos. Vuelve a intentarlo en un momento.'
          : 'Todavía no hay artículos publicados.');
        return;
      }
      renderPosts(result.posts);
    })
    .catch(function (err) {
      /* Un 404 del índice significa que aún no se ha generado (o que el
         blog todavía no tiene artículos); el resto son fallos de red o
         del propio JSON. */
      console.error('blog:', err);
      setState(err && err.status === 404
        ? 'Todavía no hay artículos publicados.'
        : 'No se pudo cargar el listado de artículos.');
    });
})();
