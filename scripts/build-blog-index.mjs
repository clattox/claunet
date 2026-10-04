#!/usr/bin/env node
/* ============================================================
   build-blog-index.mjs — regenera content/blog/index.json

   Por qué existe: el blog se escribe desde el panel (/admin, Sveltia
   CMS), que publica Markdown suelto en content/blog/. Un sitio estático
   no puede listar un directorio en producción —Vercel no tiene
   directory listing—, así que blog.html necesita un índice explícito
   con los nombres de los artículos. Este script lo genera mirando el
   propio directorio: la lista nunca se escribe a mano.

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

  console.log(`content/blog/index.json → ${index.length} artículo(s)`);
  posts.forEach((post, i) => {
    console.log(`  ${String(i + 1).padStart(2, '0')}. ${post.name}${post.date ? ` (${post.date})` : ''}`);
  });
}

main().catch((err) => {
  console.error('build-blog-index:', err.message);
  process.exit(1);
});
