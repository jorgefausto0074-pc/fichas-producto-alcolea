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

## Cómo actualizar las fichas

Jorge lo hace desde la propia aplicación, en el enlace discreto **Actualizar fichas** del pie. No es la contraseña de las fichas.

1. La primera vez, crea `acceso.enc` en tu ordenador y súbelo a la raíz de `main`. El token no se escribe en el chat ni en el repositorio en claro:

```bash
ACCESO_TOKEN='github_pat_…' ACCESO_CLAVE='la clave de actualización' node tools/crear_acceso.mjs
```

`ACCESO_TOKEN` es un token fino con Contents (lectura y escritura) y Actions (lectura y escritura), solo de este repositorio. `ACCESO_CLAVE` es una clave distinta de la contraseña de la aplicación. El comando escribe `acceso.enc`. Súbelo con git y no pegues el token en ningún sitio.

2. En la aplicación, entra con la contraseña de siempre. Abre **Actualizar fichas**, escribe la clave de actualización y, si quieres, márcala para recordarla en ese dispositivo. Se guarda una clave no exportable; el token no se muestra.
3. Elige uno o dos PDF del informe de Access (asépticos, no asépticos, o los dos). El navegador los cifra con la contraseña de la aplicación y los sube como `entrada.enc` a un **borrador** de release llamado `actualizacion-pendiente`. No entran en el historial de `main` y, al ser borrador, no son públicos.
4. La aplicación lanza el flujo **Actualizar fichas** en modo `revisar`. Tarda unos minutos. Al terminar muestra altas, bajas, modificadas (antes → después), incidencias y avisos.
5. **Aprobar y publicar** lanza el modo `aplicar`. Solo se commitean `datos.enc` y `formato.json`. Luego se borra el borrador. **Descartar** borra el borrador sin publicar.
6. Cuando diga Publicado, recarga. La aplicación pide `datos.enc?v=<sha256>` nuevo.

Si la clave de actualización es incorrecta, lo dice y no sigue. Si el PDF no es un informe de Alcolea, el flujo termina con un aviso y un enlace a la ejecución. Si las fichas publicadas cambiaron entre la revisión y la aprobación, hay que descartar y revisar otra vez.

Para cambiar el token o la clave de actualización, vuelve a ejecutar el comando de arriba con los valores nuevos, sustituye `acceso.enc` en `main` y, en la aplicación, pulsa **Olvidar la clave de actualización**. La contraseña de las fichas sigue siendo el secreto `PT_PASSWORD`: no va en el repositorio. Si cambia el HTML, el CSS o el JavaScript, sube también la constante `SHELL` de `sw.js`.

El detalle del extractor está en `updater/README_ACTUALIZADOR.md`.

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
