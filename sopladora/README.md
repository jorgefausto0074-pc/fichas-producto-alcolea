# Calculadora Sopladora

Zonas de corte de botellas para la sopladora de Refresco Iberia, planta Alcolea. La usa Calidad. Responsable: Jorge Quesada Ortega.

La aplicación vive en este repositorio, en la carpeta `sopladora/`, y GitHub Pages la publica en:

https://jorgefausto0074-pc.github.io/fichas-producto-alcolea/sopladora/

Usa la misma contraseña que Fichas de producto terminado (el secreto `PT_PASSWORD`). Los gramajes van cifrados en `datos.enc`. Sin esa contraseña no se leen. La sesión recordada se guarda en IndexedDB con el nombre `calculadora-sopladora`, aparte de la de Fichas.

## Publicar los datos (hace falta una vez)

El paquete cifrado no está en el repositorio hasta que se genere con la contraseña. El JSON y las fotos no se suben en claro.

1. Abre `preparar.html` (en local o, cuando la web esté publicada, https://jorgefausto0074-pc.github.io/fichas-producto-alcolea/sopladora/preparar.html).
2. Elige `botellas.json` y las fotos de botella. Una botella nueva usa el siguiente `slideNN` libre (20, 21…) y los id `bNN` / `sNN-NN`.
3. Escribe la contraseña de Fichas. El cifrado se hace en el navegador. La contraseña no se envía a ningún sitio.
4. Descarga `datos.enc` y `formato.json`, colócalos en `sopladora/` y súbelos a `main`.

En la terminal, con los archivos fuera del repositorio:

```bash
PT_PASSWORD='…' node sopladora/tools/cifrar.mjs \
  --datos /ruta/botellas.json \
  --fotos /ruta/fotos \
  --salida sopladora
```

Después se puede lanzar el flujo **Cifrar Calculadora Sopladora**: comprueba que el paquete abre con `PT_PASSWORD` y no imprime gramajes.

## APK

El flujo **APK Calculadora Sopladora** compila `sopladora/android` (paquete `com.jorgefausto.sopladora`) con la misma firma que Fichas y deja el APK como artefacto. Con el disparo manual y una etiqueta, lo publica también en una release. La aplicación abre la web; no lleva los gramajes dentro.

## Qué enseña

Listado con buscador (sin tildes, coincidencia parcial) y filtros de gas y capacidad. En la ficha: foto, zonas, mínimos, máximo y el medio como objetivo, porcentajes que suman 100,00 % y la calculadora del gramaje nuevo. El reparto es por mayor resto, en centésimas, y la suma de los medios de zona es exactamente el gramaje escrito. Mínimo y máximo nuevos conservan el margen en gramos de la ficha. Mín-Mín y Máx-Máx (±0,20 g) van en un recuadro aparte, como valor extremo / excepcional. Hay medias por grupo y exportación con Imprimir / Guardar PDF (en el APK, el puente de impresión).

El gramaje patrón de cada ficha es la suma de los medios de sus zonas, para que la tabla cuadre. En algunas fichas esa suma no es el «Peso total» escrito en el PowerPoint; la aplicación no muestra ese descuadre ni reparte los gramos para forzarlo. El detalle queda en el informe de la auditoría, no en la pantalla.

La cabecera y el pie leen la edición y la fecha del paquete (`meta.edicion` y `meta.fecha_portada` en `botellas.json`) o, si no vienen, de `formato.json` (`edicion` y `fecha_portada`). `completarFormato` en `js/paquete.js` y `tools/cifrar.mjs` escriben esos campos al cifrar. No cambian los gramajes. El flujo del Excel maestro debe dejar esos dos campos en `meta`.

En el dispositivo se guardan, en `localStorage` con la clave `calculadora-sopladora-memoria`, el último gramaje de cada ficha, el historial, los favoritos, los pesos medidos, el modo línea y las dos fichas de la comparación. La contraseña no va ahí.
