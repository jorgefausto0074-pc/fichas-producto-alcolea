// Crea acceso.enc. La clave y el token solo llegan por el entorno.
//   ACCESO_TOKEN=… ACCESO_CLAVE=… node tools/crear_acceso.mjs
// Opcional: ACCESO_REPO (por defecto el repositorio de Alcolea) y ACCESO_SALIDA.

import { writeFile } from 'fs/promises';
import { crearSobreAcceso } from '../js/acceso.js';

const token = process.env.ACCESO_TOKEN || '';
const clave = process.env.ACCESO_CLAVE || '';
const repo = process.env.ACCESO_REPO || 'jorgefausto0074-pc/fichas-producto-alcolea';
const salida = process.env.ACCESO_SALIDA || 'acceso.enc';

if (!token || !clave) {
  console.error('Faltan ACCESO_TOKEN y ACCESO_CLAVE en el entorno.');
  process.exit(1);
}

const bytes = await crearSobreAcceso(clave, { token, repo });
await writeFile(salida, bytes);
console.log(`Escrito ${salida} (${bytes.length} bytes). El token no se muestra.`);
