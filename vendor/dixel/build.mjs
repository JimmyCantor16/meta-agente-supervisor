import { readdir, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

function loadEsbuild() {
  try {
    return createRequire(import.meta.url)('esbuild');
  } catch {
    return null;
  }
}

const root = dirname(fileURLToPath(import.meta.url));
const coreOrder = [
  'core/dixel.js',
  'core/Utils.js',
  'core/Ticker.js',
  'core/Viewport.js',
  'core/Pointer.js',
  'core/Motion.js',
  'core/SmoothScroll.js',
  'core/ScrollWatch.js',
  'core/Overlays.js',
  'core/Component.js'
];
const allDirs = ['icons', 'components', 'effects', 'scrollbars', 'shaders'];

function arg(name) {
  const found = process.argv.slice(2).find((item) => item.startsWith('--' + name + '='));
  return found ? found.slice(name.length + 3) : null;
}

const only = arg('only');
const outDir = arg('out') || 'dist';
const selected = only ? only.split(',').map((item) => item.trim()).filter(Boolean) : null;
const scanDirs = selected ? selected : allDirs;

async function collect(dir, ext) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await collect(full, ext)));
    else if (entry.name.endsWith(ext)) found.push(full);
  }
  return found;
}

async function buildCatalog() {
  const catalog = {};
  for (const dir of scanDirs) {
    for (const file of await collect(join(root, dir), '.json')) {
      if (!file.endsWith('manifest.json')) continue;
      const relative = file.slice(root.length + 1).replace(/\\/g, '/');
      const category = relative.replace('/manifest.json', '');
      try {
        catalog[category] = JSON.parse(await readFile(file, 'utf8'));
      } catch (error) {
        throw new Error('Manifest inválido: ' + relative + ' → ' + error.message);
      }
    }
  }
  return 'window.DixelCatalog = ' + JSON.stringify(catalog, null, 2) + ';\n';
}

async function build() {
  const jsParts = [];
  for (const rel of coreOrder) {
    jsParts.push(await readFile(join(root, rel), 'utf8'));
  }
  const cssParts = [await readFile(join(root, 'tokens/tokens.css'), 'utf8')];
  for (const dir of scanDirs) {
    const base = join(root, dir);
    const js = await collect(base, '.js');
    const css = await collect(base, '.css');
    if (selected && !js.length && !css.length) throw new Error('Categoría inexistente: ' + dir);
    for (const file of js) jsParts.push(await readFile(file, 'utf8'));
    for (const file of css) cssParts.push(await readFile(file, 'utf8'));
  }
  const out = join(root, outDir);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'dixel.js'), jsParts.join('\n;\n'));
  await writeFile(join(out, 'dixel.css'), cssParts.join('\n'));
  await writeFile(join(out, 'catalog.js'), await buildCatalog());
  const jsSize = (await stat(join(out, 'dixel.js'))).size;
  const cssSize = (await stat(join(out, 'dixel.css'))).size;
  const etiqueta = selected ? 'perfil [' + selected.join(' ') + '] → ' + outDir : outDir;
  console.log(etiqueta + ': dixel.js ' + (jsSize / 1024).toFixed(1) + ' kB · dixel.css ' + (cssSize / 1024).toFixed(1) + ' kB');
  const esbuild = loadEsbuild();
  if (!esbuild) {
    console.log('esbuild no instalado: se omiten los .min (npm i -D esbuild para generarlos)');
    return;
  }
  const js = await readFile(join(out, 'dixel.js'), 'utf8');
  const css = await readFile(join(out, 'dixel.css'), 'utf8');
  const minJs = await esbuild.transform(js, { minify: true, target: 'es2020' });
  const minCss = await esbuild.transform(css, { minify: true, loader: 'css' });
  await writeFile(join(out, 'dixel.min.js'), minJs.code);
  await writeFile(join(out, 'dixel.min.css'), minCss.code);
  console.log('dixel.min.js ' + (minJs.code.length / 1024).toFixed(1) + ' kB · dixel.min.css ' + (minCss.code.length / 1024).toFixed(1) + ' kB');
}

build();
