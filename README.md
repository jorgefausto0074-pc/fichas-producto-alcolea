# Fichas de producto terminado · Alcolea

Aplicación para consultar las fichas de producto terminado de Refresco Iberia, planta Alcolea. La usa el equipo de Calidad. Responsable: Jorge Quezada Ortega, coordinador de Calidad.

La aplicación es un sitio estático. No hay compilación. GitHub Pages publica la rama `main`, carpeta raíz, en:

https://jorgefausto0074-pc.github.io/fichas-producto-alcolea/

## Cómo usarla

1. Abre la dirección de arriba (o, en local, sirve esta carpeta con cualquier servidor estático).
2. Escribe la contraseña que se entrega aparte. No está en el repositorio ni en el código.
3. Si marcas **Recordar en este dispositivo**, el navegador guarda una clave criptográfica no exportable en IndexedDB. No se guarda la contraseña. **Salir** borra esa clave.
4. Busca por código SAP, código G, denominación, marca, EAN o texto libre. Las tildes no importan y vale una coincidencia parcial.
5. Un enlace `?sap=XXXXXXXX` o `?g=G00XXXX` abre esa ficha o ese código de mezcla en cuanto la sesión está abierta.
6. Los filtros de grupo (asépticos / carbonatados), formato, familia y marca se combinan con la búsqueda.
7. En la ficha puedes copiar códigos, ampliar los dibujos, imprimir o guardar PDF, y marcar hasta tres productos para compararlos.
8. Los valores se muestran tal cual llegan en el paquete. Si el PDF de origen trae una incoherencia, la ficha la enseña como aviso y no la corrige.
9. Para instalarla: en Chrome o Edge, **Instalar**; en el iPhone, Compartir → Añadir a pantalla de inicio. Tras la primera carga con red, las fichas siguen disponibles sin cobertura: el service worker guarda la aplicación y el paquete cifrado.

## Cómo actualizar los datos

El extractor offline del propietario regenera dos ficheros y nada más hace falta para publicar datos nuevos:

1. Sustituye `datos.enc` y `formato.json` en la raíz de este repositorio.
2. Publica en `main`.

No incrustes datos de producto en el código. La aplicación lee `formato.json` (fecha de generación, sal, iv e `sha256_datos_enc`) y pide `datos.enc?v=<sha256>`. Ese sufijo cambia con cada paquete, así que el service worker no se queda con el cifrado anterior. La sal y el iv también cambian en cada generación: quien tuviera la sesión recordada tendrá que volver a escribir la contraseña.

Si cambias HTML, CSS o JavaScript, sube también la constante `SHELL` de `sw.js` para que los navegadores suelten la caché de la aplicación. Un cambio solo de `datos.enc` y `formato.json` no necesita ese paso.

## Qué hay en el repositorio

| Fichero | Para qué |
|---|---|
| `index.html`, `css/`, `js/`, `sw.js`, `manifest.webmanifest`, `icons/` | La aplicación |
| `datos.enc` | Paquete cifrado (AES-256-GCM). Sin la contraseña no se lee |
| `formato.json` | Parámetros públicos del cifrado, fecha y recuentos. No lleva fichas |
| `js/descifrar.js` | Descifrado en el navegador con WebCrypto |

No se versionan el ZIP de origen, el esquema con ejemplos, las páginas de referencia ni ningún texto plano de producto.

## Probar en local

Desde la raíz del repositorio:

```bash
python3 -m http.server 8080
```

Abre http://127.0.0.1:8080/ . Hace falta un contexto seguro o `localhost` para WebCrypto y el service worker.

Para comprobar el descifrado sin abrir el navegador (la contraseña por variable de entorno, nunca escrita en un fichero):

```bash
PT_PASSWORD='…' node tests/verificar.mjs
```

Si tienes a mano el `ESQUEMA.md` de la generación, fuera del repositorio:

```bash
PT_PASSWORD='…' node tests/verificar.mjs --esquema /ruta/ESQUEMA.md
```
