/* ============================================================
   ClauNet — listado del blog (blog.html)
   1. Lee content/blog/index.json, la lista de artículos que mantiene
      scripts/build-blog-index.mjs (un sitio estático no puede listar
      directorios, así que el índice es un fichero real del repo).
   2. Descarga cada .md, lee su frontmatter y pinta la tarjeta.
   3. Cada tarjeta enlaza a articulo.html?slug=… (la página del artículo).

   El .md es la única fuente de verdad: el índice solo lleva nombres de
   fichero. El parser de frontmatter, las fechas en español, la portada
   de reserva y el render de Markdown viven en blog-lib.js, compartidos
   con la página de artículo. Todo el texto del CMS entra por
   textContent, nunca por innerHTML.
   ============================================================ */

(function () {
  'use strict';

  /* Helpers compartidos con la página de artículo (blog-lib.js). */
  var B = window.ClauBlog;
  if (!B) return;

  var el = B.el;
  var fetchText = B.fetchText;
  var encodePath = B.encodePath;
  var formatDate = B.formatDate;
  var timeOf = B.timeOf;
  var humanize = B.humanize;
  var postFrom = B.postFrom;
  var placeholder = B.placeholder;
  var revealAll = B.revealAll;

  var INDEX_URL = 'content/blog/index.json';
  var BLOG_URL = 'content/blog/';

  /* Página del artículo. {slug} se sustituye por el nombre del .md sin
     extensión; las tarjetas (título y «Leer →») apuntan aquí. */
  var ARTICLE_URL = 'articulo.html?slug={slug}';

  var grid = document.getElementById('blogGrid');
  var status = document.getElementById('blogStatus');
  if (!grid) return;

  /* ---------- tarjetas ---------- */

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
    var link = el('a', null, title);
    link.href = ARTICLE_URL.replace('{slug}', encodeURIComponent(post.slug));
    heading.appendChild(link);
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

    /* «Leer →»: cierra la tarjeta y abre el artículo completo. */
    var more = el('a', 'blog-card__more');
    more.href = ARTICLE_URL.replace('{slug}', encodeURIComponent(post.slug));
    more.appendChild(document.createTextNode('Leer '));
    more.appendChild(el('span', 'blog-card__arrow', '→'));
    body.appendChild(more);

    card.appendChild(media);
    card.appendChild(body);
    return card;
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
