# Fichas Alcolea para Android

Aplicación nativa mínima. El WebView abre la web publicada:

https://jorgefausto0074-pc.github.io/fichas-producto-alcolea/

El APK no contiene `datos.enc` ni fichas. El código, los datos y el service worker son los de esa web, así que una actualización publicada en GitHub Pages llega al reinstalar la página dentro de la aplicación. La caché sin conexión queda en el almacenamiento de la aplicación.

- Nombre: Fichas Alcolea
- Id: `com.jorgefausto.fichasalcolea`
- minSdk 24, vertical y horizontal
- La cámara se pide al escanear un código de barras
- El botón atrás recorre el historial de la web
- Los enlaces que no son de la web se abren en el navegador
- Compartir e imprimir usan el sistema Android

## Compilar

Hace falta el SDK de Android y una keystore que no está en el repositorio. Las contraseñas viven en secretos de GitHub Actions:

- `ANDROID_KEYSTORE_BASE64`
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
