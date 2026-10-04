#!/usr/bin/env node
/* ============================================================
   build-blog-index.mjs — regenera content/blog/index.json y el bloque de
   artículos de sitemap.xml

   Por qué existe: el blog se escribe desde el panel (/admin, Sveltia
   CMS), que publica Markdown suelto en content/blog/. Un sitio estático
   no puede listar un directorio en producción —Vercel no tiene
   directory listing—, así que blog.html necesita un índice explícito
   con los nombres de los artículos. Este script lo genera mirando el
   propio directorio: la lista nunca se escribe a mano.

   Además rellena el bloque del blog de sitemap.xml —lo que va entre las
   marcas «blog:start» y «blog:end»—, de modo que cada artículo tenga su
   URL con slug sin que nadie la escriba a mano. El resto de sitemap.xml
   se respeta: es un único sitemap, el que ya anuncia robots.txt, en vez de
   dos ficheros que se pueden desincronizar.

   Se ejecuta:
     · a mano →  node scripts/build-blog-index.mjs
     · solo   →  .github/workflows/blog-index.yml (en cada push que
                 toque content/blog/**).md)

   Sin dependencias: solo Node (>=18) y módulos nativos.
   El JSON guarda nombres de fichero, no copias de los datos: el .md
   sigue siendo la única fuente de verdad.
   ============================================================ */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.join(ROOT, 'content', 'blog');
const INDEX_PATH = path.join(BLOG_DIR, 'index.json');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const SITE_URL = 'https://claunet.cl';

/* Marcas que delimitan la parte generada de sitemap.xml. Se busca solo el
   prefijo —no el texto completo— para que retocar el comentario a mano no
   rompa el script. */
const BLOG_START = '<!-- blog:start';
const BLOG_END = '<!-- blog:end -->';

/* Frontmatter: solo se necesita `date` para ordenar y saber si hay
   artículo malformado. Un bloque de bloque + un regex por línea bastan;
   aquí no hace falta un parser YAML completo. */
function frontmatterOf(raw) {
  if (raw.slice(0, 3) !== '---') return '';
  const end = raw.indexOf('\n---', 3);
  return end === -1 ? raw.slice(3) : raw.slice(3, end);
}

function unquote(value) {
  const v = value.trim();
  if (v.length > 1 && ((v[0] === "'" && v.endsWith("'")) || (v[0] === '"' && v.endsWith('"')))) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

function readDate(raw) {
  const match = /^date:[ \t]*(.*)$/m.exec(frontmatterOf(raw));
  return match ? unquote(match[1]) : '';
}

/* Solo artículos: se ignoran index.json, los ficheros ocultos y los
   que empiezan por «_» (borradores o parciales). */
const isPost = (name) =>
  name.toLowerCase().endsWith('.md') && !name.startsWith('.') && !name.startsWith('_');

const timeOf = (date) => {
  const t = Date.parse(date);
  return Number.isNaN(t) ? 0 : t;
};

/* Cada artículo vive en su propia URL: articulo.html?slug=<fichero sin .md>.
   El slug va percent-encoded —«ú» → %C3%BA—, que es la forma que espera
   <loc>; de paso, encodeURIComponent escapa & y < por si el nombre trae
   alguna. `indent` es la sangría que ya traía el comentario en el fichero
   —la de los <url> del resto—, así que el bloque sale alineado con él. */
function blogSitemapBlock(posts, indent) {
  const inner = `${indent}  `;

  const rows = posts
    .map((post) => {
      const slug = post.name.replace(/\.md$/i, '');
      const lastmod = /^\d{4}-\d{2}-\d{2}/.exec(post.date);
      return [
        `${indent}<url>`,
        `${inner}<loc>${SITE_URL}/articulo.html?slug=${encodeURIComponent(slug)}</loc>`,
        lastmod ? `${inner}<lastmod>${lastmod[0]}</lastmod>` : null,
        `${inner}<changefreq>monthly</changefreq>`,
        `${inner}<priority>0.6</priority>`,
        `${indent}</url>`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return (
    `${indent}${BLOG_START} · generado por scripts/build-blog-index.mjs — no editar a mano -->\n` +
    (rows ? `${rows}\n` : '') +
    `${indent}${BLOG_END}`
  );
}

/* Reescribe solo el bloque generado y devuelve cuántas URL ha dejado —o
   null si no ha podido—. Si no hay marcas o no hay sitemap.xml avisa y
   sigue: es preferible un índice sin sitemap que un build roto. Si el
   bloque sale idéntico no toca el fichero, para que git diff lo vea
   limpio. */
async function writeSitemap(posts) {
  let sitemap;
  try {
    sitemap = await readFile(SITEMAP_PATH, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    console.warn('aviso: no hay sitemap.xml; se omite la parte del blog.');
    return null;
  }

  const start = sitemap.indexOf(BLOG_START);
  const end = sitemap.indexOf(BLOG_END);
  if (start === -1 || end < start) {
    console.warn('aviso: sitemap.xml no tiene las marcas «blog:start»/«blog:end»; se omite la parte del blog.');
    return null;
  }

  /* La marca abre su propia línea, así que lo que hay entre el salto previo
     y la marca es su sangría: se reaprovecha para no desalinear el fichero. */
  const lineStart = sitemap.lastIndexOf('\n', start - 1) + 1;
  const indent = sitemap.slice(lineStart, start);

  const next =
    sitemap.slice(0, lineStart) +
    blogSitemapBlock(posts, indent) +
    sitemap.slice(end + BLOG_END.length);
  if (next !== sitemap) await writeFile(SITEMAP_PATH, next, 'utf8');

  return posts.length;
}

async function main() {
  let names;
  try {
    names = (await readdir(BLOG_DIR)).filter(isPost);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    names = []; // todavía no hay carpeta: el índice queda vacío, no es un error
  }

  const posts = [];
  for (const name of names) {
    const raw = await readFile(path.join(BLOG_DIR, name), 'utf8');
    const date = readDate(raw);
    if (!date) {
      console.warn(`aviso: ${name} no tiene «date» en el frontmatter; se lista al final.`);
    }
    posts.push({ name, date });
  }

  /* Más reciente primero, y a igualdad de fecha por nombre, para que el
     orden sea estable y el diff del JSON no baile entre ejecuciones. */
  posts.sort((a, b) => timeOf(b.date) - timeOf(a.date) || a.name.localeCompare(b.name, 'es'));

  const index = posts.map((post) => post.name);
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2) + '\n', 'utf8');

  const urls = await writeSitemap(posts);

  console.log(`content/blog/index.json → ${index.length} artículo(s)`);
  if (urls !== null) console.log(`sitemap.xml → ${urls} URL(s) de artículo`);
  posts.forEach((post, i) => {
    console.log(`  ${String(i + 1).padStart(2, '0')}. ${post.name}${post.date ? ` (${post.date})` : ''}`);
  });
}

main().catch((err) => {
  console.error('build-blog-index:', err.message);
  process.exit(1);
});
