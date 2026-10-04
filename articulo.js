/* ============================================================
   ClauNet — página de artículo (articulo.html)
   Lee el slug de la URL (?slug=nombre-del-fichero), descarga su .md de
   content/blog/ y lo pinta: portada, categoría, título, fecha, cuerpo
   (Markdown → DOM) y etiquetas. El .md es la única fuente de verdad.

   Reutiliza blog-lib.js (window.ClauBlog): frontmatter, fechas en
   español, fetch codificado, portada de reserva y render de Markdown.
   Todo el texto del CMS entra por textContent/createElement —nunca por
   innerHTML—, así que nada escrito en el .md puede inyectar marcado.
   ============================================================ */

(function () {
  'use strict';

  var B = window.ClauBlog;
  if (!B) return;

  var head = document.getElementById('articleHead');
  var body = document.getElementById('articleBody');
  var foot = document.getElementById('articleFoot');
  var tags = document.getElementById('articleTags');
  if (!head || !body || !foot || !tags) return;

  /* El slug llega en la URL. Se toma solo el nombre del fichero —sin
     ninguna carpeta— para que no se pueda salir de content/blog/. */
  function slugFromUrl() {
    var raw = '';
    try {
      raw = new URLSearchParams(window.location.search).get('slug') || '';
    } catch (e) {
      raw = '';
    }
    var slug = raw.trim().replace(/\.md$/i, '').replace(/\\/g, '/');
    slug = slug.slice(slug.lastIndexOf('/') + 1);
    return (slug === '.' || slug === '..') ? '' : slug;
  }

  function setState(message) {
    body.innerHTML = '';
    body.removeAttribute('aria-busy');
    body.appendChild(B.el('p', 'blog-state', message));
  }

  function setMeta(selector, value) {
    if (!value) return;
    var node = document.querySelector(selector);
    if (node) node.setAttribute('content', value);
  }

  /* Portada grande. Si el .md no trae `cover`, o si la imagen no llega a
     cargar, se pinta la misma nube del logotipo que las tarjetas: la ficha
     nunca se queda con un hueco ni con un icono de imagen rota. */
  function coverNode(cover, title) {
    var media = B.el('figure', 'article__cover');

    if (!cover) {
      media.classList.add('is-empty');
      media.appendChild(B.placeholder('article'));
      return media;
    }

    var img = document.createElement('img');
    img.src = B.encodePath(cover);
    img.alt = 'Portada: ' + title;
    img.decoding = 'async';
    img.addEventListener('error', function () {
      if (media.classList.contains('is-empty')) return;
      media.classList.add('is-empty');
      media.removeChild(img);
      media.appendChild(B.placeholder('article'));
    });
    media.appendChild(img);
    return media;
  }

  function render(slug, post, markdown) {
    var title = post.title || B.humanize(slug);
    var fecha = B.formatDate(post.date);

    /* Pestaña y metadatos sociales con los datos reales del artículo. */
    var canonical = 'https://claunet.cl/articulo.html?slug=' + encodeURIComponent(slug);
    document.title = title + ' — ClauNet';
    var canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.href = canonical;
    setMeta('meta[property="og:url"]', canonical);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[property="og:description"]', post.excerpt);
    setMeta('meta[name="twitter:description"]', post.excerpt);
    setMeta('meta[name="description"]', post.excerpt);
    if (post.cover) {
      var abs = new URL(B.encodePath(post.cover), window.location.href).href;
      setMeta('meta[property="og:image"]', abs);
      setMeta('meta[name="twitter:image"]', abs);
    }

    /* Encabezado: portada (la del .md o la nube de reserva), categoría,
       título y fecha. */
    head.appendChild(coverNode(post.cover, title));
    if (post.category) head.appendChild(B.el('p', 'article__cat', post.category));
    head.appendChild(B.el('h1', 'article__title', title));
    if (fecha) head.appendChild(B.el('p', 'article__date', fecha));
    head.hidden = false;

    /* Cuerpo: Markdown → nodos DOM. */
    body.innerHTML = '';
    body.removeAttribute('aria-busy');
    body.appendChild(B.renderMarkdown(markdown));

    /* Etiquetas al final; si no hay, se oculta la lista (el pie con
       «← Volver al blog» se queda). */
    post.tags.forEach(function (tag) {
      tags.appendChild(B.el('li', 'article__tag', tag));
    });
    if (!post.tags.length) tags.hidden = true;
    foot.hidden = false;

    /* Aparición progresiva: site.js ya lanzó su observador al cargar el
       documento, así que estos nodos —creados después— lo repiten aquí.
       Solo encabezado y pie: el cuerpo puede ser tan alto que el umbral
       del observador (0,12) no llegara a cumplirse y se quedaría oculto. */
    head.classList.add('reveal');
    foot.classList.add('reveal');
    B.revealAll([head, foot]);
  }

  var slug = slugFromUrl();
  if (!slug) {
    setState('No encontramos ese artículo.');
    return;
  }

  B.fetchText('content/blog/' + B.encodePath(slug) + '.md')
    .then(function (raw) {
      render(slug, B.postFrom(slug + '.md', raw), B.parseFrontmatter(raw).body);
    })
    .catch(function (err) {
      console.error('articulo:', err);
      setState(err && err.status === 404
        ? 'No encontramos ese artículo.'
        : 'No se pudo cargar el artículo. Vuelve a intentarlo en un momento.');
    });
})();
