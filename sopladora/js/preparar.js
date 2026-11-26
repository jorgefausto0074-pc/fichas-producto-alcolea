import { empaquetarIndice } from './descifrar.js';
import { completarFormato, montarIndice, numeroDiapositiva } from './paquete.js';

const estado = document.getElementById('estado');
const descargas = document.getElementById('descargas');

function decir(texto) {
  estado.textContent = texto;
}

function descargar(nombre, bytes, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.className = 'btn btn-secondary';
  a.textContent = `Descargar ${nombre}`;
  descargas.append(a);
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function medidas(bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  try {
    const bmp = await createImageBitmap(blob);
    const r = { ancho: bmp.width, alto: bmp.height };
    bmp.close();
    return r;
  } catch {
    return { ancho: 0, alto: 0 };
  }
}

document.getElementById('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  descargas.hidden = true;
  descargas.replaceChildren();
  const fd = new FormData(ev.target);
  const password = String(fd.get('clave') || '');
  const jsonFile = fd.get('json');
  const fotos = [...ev.target.fotos.files];
  if (!password || !jsonFile || !fotos.length) {
    decir('Faltan el JSON, las fotos o la contraseña.');
    return;
  }
  decir('Leyendo los archivos en este dispositivo…');
  let doc;
  try {
    doc = JSON.parse(await jsonFile.text());
  } catch {
    decir('El JSON no se ha podido leer.');
    return;
  }
  const mapa = new Map();
  for (const foto of fotos) {
    const slide = numeroDiapositiva(foto.name);
    if (!slide) continue;
    const bytes = new Uint8Array(await foto.arrayBuffer());
    const mime = foto.type || (foto.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    const med = await medidas(bytes, mime);
    mapa.set(slide, { bytes, mime, ...med, sha256: await sha256Hex(bytes) });
  }
  let montado;
  try {
    montado = montarIndice(doc, mapa);
  } catch (err) {
    decir(err?.code === 'foto' ? err.message : 'No se ha podido montar el paquete.');
    return;
  }
  decir('Cifrando… puede tardar un poco.');
  const boton = ev.target.querySelector('button');
  boton.disabled = true;
  try {
    const { enc, formato } = await empaquetarIndice(password, montado.indice, montado.blob);
    const completo = completarFormato(formato, montado.indice.doc);
    descargar('datos.enc', enc, 'application/octet-stream');
    descargar('formato.json', new TextEncoder().encode(JSON.stringify(completo, null, 1)), 'application/json');
    descargas.hidden = false;
    const n = montado.indice.doc.botellas.reduce((s, b) => s + b.fichas.length, 0);
    decir(`Listo: ${n} fichas cifradas. Descarga los dos archivos, colócalos en la carpeta sopladora del repositorio y súbelos a main. La contraseña no se ha guardado.`);
  } catch {
    decir('No se ha podido cifrar.');
  } finally {
    boton.disabled = false;
  }
});
