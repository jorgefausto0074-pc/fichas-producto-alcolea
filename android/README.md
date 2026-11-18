# Fichas Alcolea para Android

Aplicación nativa mínima. El WebView abre la web publicada:

https://jorgefausto0074-pc.github.io/fichas-producto-alcolea/

El APK no contiene `datos.enc` ni fichas. El código, los datos y el service worker son los de esa web, así que una actualización publicada en GitHub Pages llega al abrir la aplicación. La caché sin conexión queda en el almacenamiento de la aplicación.

- Nombre: Fichas Alcolea
- Id: `com.jorgefausto.fichasalcolea`
- minSdk 24, vertical y horizontal
- La cámara se pide al escanear un código de barras
- El botón atrás recorre el historial de la web
- Los enlaces que no son de la web se abren en el navegador
- Compartir e imprimir usan el sistema Android
- Desde v1.1.0 (versionCode 2), «Exportar a Excel» guarda el .xlsx en Descargas/Fichas Alcolea (Android 10+; en Android 7-9, en la carpeta Documentos de la app) y abre el menú de compartir del sistema. Puente JS: `FichasAndroid.guardarArchivo(nombre, mime, base64)`; la respuesta llega a `window.__fichasArchivo`

## Compilar

Hace falta el SDK de Android. La keystore no está en claro en el repositorio. Hay una copia cifrada con AES-256-CBC y PBKDF2 en `fichas-release.keystore.enc`. La contraseña de ese archivo no está en el repositorio.

Para que el flujo de GitHub Actions pueda firmar, un administrador del repositorio tiene que crear estos secretos:

- `ANDROID_KEYSTORE_BASE64` (la keystore en base64, no el archivo cifrado)
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

El flujo `.github/workflows/android-apk.yml` se lanza a mano y adjunta el APK a una release.

En local, con las variables de entorno de la firma:

```bash
cd android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleRelease
```
