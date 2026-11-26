// Recorre la app en Chrome con un paquete cifrado de prueba (contraseña que no es la real).
// BOTELLAS_JSON=… FOTOS=… node sopladora/tests/navegar.mjs

import { spawn } from 'child_process';
import { createRequire } from 'module';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(process.env.PUPPETEER_REQUIRE || '/tmp/nav/package.json');
const puppeteer = require('puppeteer-core');

const aqui = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(aqui, '../..');
const jsonPath = process.env.BOTELLAS_JSON;
const fotos = process.env.FOTOS;
const password = 'prueba-local-sopladora';
const capturas = process.env.CAPTURAS || '/tmp/sopladora-capturas';
const paqueteDir = '/tmp/sopladora-paquete-prueba';
mkdirSync(capturas, { recursive: true });
mkdirSync(paqueteDir, { recursive: true });

if (!jsonPath || !fotos) {
  console.error('Faltan BOTELLAS_JSON y FOTOS.');
  process.exit(1);
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(cmd + ' ' + code))));
  });
}

await run('node', [
  path.join(repo, 'sopladora/tools/cifrar.mjs'),
  '--datos', jsonPath,
  '--fotos', fotos,
  '--salida', paqueteDir,
], { PT_PASSWORD: password });

const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.enc': 'application/octet-stream',
};

function enviar(res, file, code = 200) {
  const ext = path.extname(file);
  res.writeHead(code, { 'content-type': tipos[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(url.pathname);
  if (rel.includes('..')) {
    res.writeHead(400);
    res.end();
    return;
  }
  if (rel === '/sopladora/datos.enc' || rel.startsWith('/sopladora/datos.enc')) {
    enviar(res, path.join(paqueteDir, 'datos.enc'));
    return;
  }
  if (rel === '/sopladora/formato.json') {
    enviar(res, path.join(paqueteDir, 'formato.json'));
    return;
  }
  let file = path.join(repo, rel);
  if (rel.endsWith('/')) file = path.join(file, 'index.html');
  if (!file.startsWith(repo)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('no');
    return;
  }
  enviar(res, file);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const puerto = server.address().port;
const base = `http://127.0.0.1:${puerto}/sopladora/`;
const fallos = [];
function ok(cond, msg) {
  if (!cond) fallos.push(msg);
  else console.log('ok', msg);
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  headless: true,
  protocolTimeout: 20000,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function shot(page, nombre) {
  try {
    await page.screenshot({ path: path.join(capturas, nombre), fullPage: false, timeout: 8000 });
  } catch (err) {
    console.log('sin captura', nombre);
  }
}

async function saltarPortada(page) {
  await page.waitForSelector('[data-vista="portada"], #clave, [data-vista="lista"]', { timeout: 8000 });
  const portada = await page.$('[data-vista="portada"]');
  if (portada) {
    try { await portada.click(); } catch { /* la portada ya pasó sola */ }
  }
}

async function entrar(page, clave) {
  await saltarPortada(page);
  await page.waitForSelector('#clave', { timeout: 8000 });
  await page.click('#clave', { clickCount: 3 });
  await page.type('#clave', clave);
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-vista="portada"]', { timeout: 8000 });
  await shot(page, '01-portada.png');

  await entrar(page, 'no-es-la-clave');
  await page.click('#login-form button[type="submit"]');
  await page.waitForFunction(() => (document.querySelector('.error')?.textContent || '').includes('Contraseña incorrecta'), { timeout: 30000 });
  ok(true, 'la contraseña incorrecta falla');
  await shot(page, '02-login-error.png');

  await page.click('#clave', { clickCount: 3 });
  await page.type('#clave', password);
  await page.click('input[name="recordar"]');
  await page.click('#login-form button[type="submit"]');
  await page.waitForSelector('[data-vista="lista"]', { timeout: 30000 });
  const esperadas = JSON.parse(readFileSync(jsonPath, 'utf8')).botellas.length;
  const tarjetas = await page.$$eval('.tarjeta', (n) => n.length);
  ok(tarjetas === esperadas, `${esperadas} botellas en el listado (${tarjetas})`);
  await shot(page, '03-listado.png');

  await page.type('#q', 'hacendado');
  await page.waitForFunction(() => document.querySelectorAll('.tarjeta').length === 7);
  ok(true, 'búsqueda «hacendado»');
  await page.click('#q', { clickCount: 3 });
  await page.type('#q', '21,65');
  await page.waitForFunction(() => document.querySelectorAll('.tarjeta').length === 1);
  ok(true, 'búsqueda «21,65»');
  const q = await page.$('#q');
  await q.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#q', 'zzzz');
  await page.waitForFunction(() => document.body.innerText.includes('Ninguna botella coincide'));
  ok(true, 'búsqueda sin resultados');
  await q.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  const sinGas = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.chip')].find((el) => el.textContent === 'Sin gas');
    b.click();
    return true;
  });
  ok(sinGas, 'filtro sin gas pulsado');
  await page.waitForFunction(() => document.querySelectorAll('.tarjeta').length === 7);
  ok(true, '7 botellas sin gas');

  await page.setViewport({ width: 1280, height: 1700 });
  await page.evaluate(() => { location.hash = '#/ficha/s06-19'; });
  await page.waitForSelector('[data-ficha="s06-19"]');
  await shot(page, '04-ficha.png');
  await page.type('#nuevo-gramaje', '38,25');
  await page.waitForSelector('[data-suma-nueva]');
  const cuadra = await page.$eval('[data-suma-nueva]', (el) => el.dataset.sumaNueva === el.dataset.n && el.dataset.n === '3825');
  ok(cuadra, 'la suma de zonas del gramaje nuevo es exacta');
  const pct = await page.$$eval('[data-pct-total]', (els) => els.map((el) => el.dataset.pctTotal));
  ok(pct.every((v) => v === '10000'), 'los porcentajes mostrados suman 100,00');
  const textoFicha = await page.evaluate(() => document.body.innerText);
  ok(!/diferencia/i.test(textoFicha), 'la ficha no muestra una fila de descuadre');
  await page.click('.extremos summary');
  await page.waitForSelector('.extremos[open]');
  const extremos = await page.$eval('.extremos', (el) => el.innerText);
  ok(/valor extremo \/ excepcional/i.test(extremos), 'recuadro de valor extremo');
  ok(extremos.includes('0,20'), 'el recuadro explica los 0,20 g');
  await shot(page, '05-calculadora-extremos.png');

  await page.emulateMediaType('print');
  await shot(page, '06-impresion.png');
  await page.emulateMediaType('screen');

  await page.evaluate(() => { location.hash = '#/medias'; });
  await page.waitForSelector('[data-vista="medias"]');
  await shot(page, '07-medias.png');
  const mediasTxt = await page.evaluate(() => document.body.innerText);
  ok(!/diferencia/i.test(mediasTxt), 'las medias no muestran un descuadre');
  ok(mediasTxt.includes('Medias de porcentaje'), 'pestaña de medias');

  const auditoria = await page.evaluate(async (clave) => {
    const { auditarDocumento } = await import('./js/auditar.js');
    const { abrirPaquete } = await import('./js/descifrar.js');
    const formato = await (await fetch('formato.json', { cache: 'no-store' })).json();
    const enc = new Uint8Array(await (await fetch(`datos.enc?v=${formato.sha256_datos_enc}`, { cache: 'no-store' })).arrayBuffer());
    const paquete = await abrirPaquete(clave, formato, enc.buffer);
    const r = auditarDocumento(paquete.doc);
    return { total: r.total, fallos: r.fallos, lista: r.lista_fallos.slice(0, 12) };
  }, password);
  ok(auditoria.fallos === 0, `auditoría en el navegador: ${auditoria.total} comprobaciones, ${auditoria.fallos} errores`);
  if (auditoria.fallos) console.error(auditoria.lista.join('\n'));

  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  ok(manifest.name === 'Calculadora Sopladora', 'nombre del manifest');
  ok(manifest.display === 'standalone' && manifest.scope === './', 'PWA instalable');
  ok(manifest.icons?.length >= 3, 'iconos del manifest');

  const reg = await page.evaluate(async () => {
    const listo = await navigator.serviceWorker.ready;
    return Boolean(listo.active);
  });
  ok(reg, 'service worker activo');
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('[data-vista="lista"]');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await saltarPortada(page);
  await page.waitForSelector('[data-vista="lista"]', { timeout: 20000 });
  ok(true, 'la sesión recordada abre el listado');
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await saltarPortada(page);
  await page.waitForSelector('[data-vista="lista"]', { timeout: 20000 });
  const offlineTxt = await page.evaluate(() => document.body.innerText);
  ok(offlineTxt.includes('13 botellas') || offlineTxt.includes('botellas'), 'sigue disponible sin conexión');
  ok(!offlineTxt.includes('Contraseña incorrecta'), 'sin conexión no pide empezar de cero');

  await page.setOfflineMode(false);
  const movil = await browser.newPage();
  await movil.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await movil.goto(base, { waitUntil: 'domcontentloaded' });
  await saltarPortada(movil);
  await movil.waitForSelector('#clave, [data-vista="lista"]', { timeout: 20000 });
  if (await movil.$('#clave')) {
    await movil.type('#clave', password);
    await movil.click('#login-form button[type="submit"]');
  }
  await movil.waitForSelector('[data-vista="lista"]', { timeout: 30000 });
  await shot(movil, '08-movil-listado.png');
  await movil.evaluate(() => { location.hash = '#/ficha/s06-19'; });
  await movil.waitForSelector('#nuevo-gramaje');
  await movil.type('#nuevo-gramaje', '41,10');
  await movil.waitForSelector('[data-suma-nueva]');
  const movilCuadra = await movil.$eval('[data-suma-nueva]', (el) => el.dataset.sumaNueva === el.dataset.n);
  ok(movilCuadra, 'en el móvil la suma también cuadra');
  await movil.click('.extremos summary');
  await movil.setViewport({ width: 390, height: 1800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await shot(movil, '09-movil-ficha.png');
  await movil.evaluate(() => { location.hash = '#/medias'; });
  await movil.waitForSelector('[data-vista="medias"]');
  await shot(movil, '10-movil-medias.png');
  const verde = await movil.evaluate(() => {
    const mal = [];
    for (const el of document.querySelectorAll('body *')) {
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) continue;
      const r = Number(m[1]);
      const g = Number(m[2]);
      const b = Number(m[3]);
      if (g > 140 && g > r + 40 && g > b + 40) mal.push(bg);
    }
    return mal.slice(0, 5);
  });
  ok(verde.length === 0, 'sin fondos verdes');
  await movil.close();
  await page.close();
} finally {
  await browser.close();
  server.close();
}

if (fallos.length) {
  console.error(fallos.join('\n'));
  process.exit(1);
}
console.log('recorrido del navegador correcto');
console.log('capturas', capturas);
