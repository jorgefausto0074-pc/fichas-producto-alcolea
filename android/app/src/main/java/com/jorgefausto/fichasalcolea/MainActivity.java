package com.jorgefausto.fichasalcolea;

import android.Manifest;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * WebView de la ficha publicada. No incluye datos de producto: los carga de GitHub Pages
 * y la caché del service worker queda en el almacenamiento de esta aplicación.
 */
public class MainActivity extends AppCompatActivity {
    static final String START_URL = "https://jorgefausto0074-pc.github.io/fichas-producto-alcolea/";
    static final String APP_HOST = "jorgefausto0074-pc.github.io";
    private static final int CAMERA_REQUEST = 41;

    /**
     * El sitio cambia de pantalla con history.pushState. WebView.canGoBack() no cuenta
     * esas entradas, así que el puente informa de cuántas hay.
     */
    private static final String PUENTE_JS =
            "(function(){"
                    + "if(!window.__fichasHistorial){"
                    + "window.__fichasHistorial=true;"
                    + "var depth=0;"
                    + "function report(){try{FichasAndroid.historial(depth);}catch(e){}}"
                    + "var push=history.pushState.bind(history);"
                    + "history.pushState=function(){"
                    + "var r=push.apply(history,arguments);depth++;report();return r;"
                    + "};"
                    + "addEventListener('popstate',function(){if(depth>0)depth--;report();});"
                    + "}"
                    + "if(window.__fichasPuente)return;"
                    + "window.__fichasPuente=true;"
                    + "navigator.share=function(data){"
                    + "data=data||{};"
                    + "return new Promise(function(resolve,reject){"
                    + "try{FichasAndroid.share(String(data.title||''),String(data.text||''),String(data.url||location.href));resolve();}"
                    + "catch(e){reject(e);}"
                    + "});"
                    + "};"
                    + "window.print=function(){try{FichasAndroid.printPage();}catch(e){}};"
                    + "})();";

    private WebView webView;
    private PermissionRequest pendingWebPermission;
    private OnBackPressedCallback atras;
    private volatile int profundidadHistorial;
    private final ExecutorService archivos = Executors.newSingleThreadExecutor();
    static final String CARPETA = "Fichas Alcolea";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        prepararServiceWorker();
        configurarWebView();
        webView.loadUrl(START_URL);

        atras = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView == null) {
                    salirDeLaApp();
                    return;
                }
                webView.evaluateJavascript(
                        "(function(){"
                                + "var b=document.querySelector("
                                + "'#escaner [data-act=\"cerrar-escaner\"],"
                                + "#compartir [data-act=\"cerrar-compartir\"],"
                                + ".lb [data-act=\"lb-close\"]');"
                                + "if(b){b.click();return 'capa';}"
                                + "return 'nav';"
                                + "})()",
                        valor -> {
                            if (valor != null && valor.contains("capa")) return;
                            if (profundidadHistorial > 0) {
                                webView.evaluateJavascript("history.back()", null);
                                return;
                            }
                            if (webView.canGoBack()) {
                                webView.goBack();
                                return;
                            }
                            salirDeLaApp();
                        });
            }
        };
        getOnBackPressedDispatcher().addCallback(this, atras);
    }

    private void salirDeLaApp() {
        if (atras != null) atras.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
    }

    private void prepararServiceWorker() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) {
            return;
        }
        ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(@NonNull WebResourceRequest request) {
                return null;
            }
        });
    }

    private void configurarWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new PuenteNativo(), "FichasAndroid");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                    webView,
                    PUENTE_JS,
                    Collections.singleton("https://jorgefausto0074-pc.github.io"));
        }
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            // DownloadManager solo acepta http/https: un blob: o data: cerraría la app.
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
                Toast.makeText(this, "Esta descarga no se puede guardar desde la app.", Toast.LENGTH_LONG).show();
                return;
            }
            try {
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimeType);
            request.addRequestHeader("User-Agent", userAgent);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    URLUtil.guessFileName(url, contentDisposition, mimeType));
            manager.enqueue(request);
            } catch (Exception e) {
                Toast.makeText(this, "No se ha podido descargar.", Toast.LENGTH_LONG).show();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> resolverPermisoWeb(request));
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    if (esDeLaApp(uri)) return false;
                    abrirFuera(uri);
                    return true;
                }
                if ("mailto".equals(scheme) || "tel".equals(scheme)) {
                    abrirFuera(uri);
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                inyectarPuentes(view);
            }
        });
    }

    private boolean esDeLaApp(Uri uri) {
        return APP_HOST.equals(uri.getHost());
    }

    private void abrirFuera(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (Exception ignored) {
            // No hay aplicación para ese enlace.
        }
    }

    private void resolverPermisoWeb(PermissionRequest request) {
        boolean camara = false;
        for (String recurso : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(recurso)) camara = true;
        }
        if (camara && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            pendingWebPermission = request;
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
            return;
        }
        request.grant(request.getResources());
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_REQUEST || pendingWebPermission == null) return;
        PermissionRequest pendiente = pendingWebPermission;
        pendingWebPermission = null;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            pendiente.grant(pendiente.getResources());
        } else {
            pendiente.deny();
        }
    }

    private void inyectarPuentes(WebView view) {
        view.evaluateJavascript(PUENTE_JS, null);
    }

    /** Nombre de archivo seguro: sin rutas ni caracteres raros. */
    static String nombreSeguro(String nombre) {
        String n = nombre == null ? "" : nombre.replaceAll("[^A-Za-z0-9._-]+", "_");
        n = n.replaceAll("^[._]+", "");
        if (n.isEmpty()) n = "archivo.xlsx";
        if (n.length() > 80) n = n.substring(n.length() - 80);
        return n;
    }

    /**
     * Guarda el archivo en Descargas/Fichas Alcolea (Android 10+, sin permisos) o en la carpeta
     * Documentos de la app (Android 7-9), deja una copia en la caché para compartir y abre el menú
     * de compartir del sistema. Nunca lanza excepciones hacia el WebView.
     */
    private void guardarYCompartir(String nombreBruto, String mimeBruto, String base64) {
        String nombre = nombreSeguro(nombreBruto);
        String mime = (mimeBruto == null || mimeBruto.isEmpty()) ? "application/octet-stream" : mimeBruto;
        String ubicacion = "";
        boolean ok = false;
        String error = "";
        try {
            byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
            if (bytes.length == 0) throw new IllegalArgumentException("vacío");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver cr = getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, nombre);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + CARPETA);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri destino = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (destino == null) throw new IllegalStateException("MediaStore");
                try (OutputStream os = cr.openOutputStream(destino)) {
                    if (os == null) throw new IllegalStateException("MediaStore");
                    os.write(bytes);
                }
                ContentValues fin = new ContentValues();
                fin.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(destino, fin, null, null);
                ubicacion = "Descargas/" + CARPETA;
            } else {
                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), CARPETA);
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("carpeta");
                try (FileOutputStream fos = new FileOutputStream(new File(dir, nombre))) {
                    fos.write(bytes);
                }
                ubicacion = "Documentos de la app/" + CARPETA;
            }
            File comp = new File(getCacheDir(), "compartir");
            if (!comp.isDirectory()) comp.mkdirs();
            File copia = new File(comp, nombre);
            try (FileOutputStream fos = new FileOutputStream(copia)) {
                fos.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".archivos", copia);
            Intent envio = new Intent(Intent.ACTION_SEND);
            envio.setType(mime);
            envio.putExtra(Intent.EXTRA_STREAM, uri);
            envio.putExtra(Intent.EXTRA_SUBJECT, nombre);
            envio.setClipData(ClipData.newRawUri(nombre, uri));
            envio.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent selector = Intent.createChooser(envio, "Compartir " + nombre);
            selector.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            ok = true;
            final String donde = ubicacion;
            runOnUiThread(() -> {
                Toast.makeText(this, "Guardado en " + donde + "/" + nombre, Toast.LENGTH_LONG).show();
                try {
                    startActivity(selector);
                } catch (Exception e) {
                    Toast.makeText(this, "No hay ninguna aplicación para compartir.", Toast.LENGTH_LONG).show();
                }
            });
        } catch (Exception e) {
            error = e.getClass().getSimpleName();
        }
        avisarWeb(ok, nombre, ubicacion, error);
    }

    private void avisarWeb(boolean ok, String nombre, String ubicacion, String error) {
        try {
            JSONObject r = new JSONObject();
            r.put("ok", ok);
            r.put("nombre", nombre);
            r.put("ubicacion", ubicacion);
            r.put("error", error);
            String js = "window.__fichasArchivo&&window.__fichasArchivo(" + r + ")";
            runOnUiThread(() -> {
                if (webView != null) webView.evaluateJavascript(js, null);
            });
        } catch (Exception ignored) {
            // El aviso a la web es opcional.
        }
    }

    @Override
    protected void onDestroy() {
        archivos.shutdown();
        super.onDestroy();
    }

    private class PuenteNativo {
        /** Desde v1.1.0: guarda un archivo generado en la web (p. ej. Excel) y abre el menú de compartir. */
        @android.webkit.JavascriptInterface
        public void guardarArchivo(String nombre, String mime, String base64) {
            archivos.execute(() -> guardarYCompartir(nombre, mime, base64));
        }

        @android.webkit.JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        @android.webkit.JavascriptInterface
        public void historial(int depth) {
            profundidadHistorial = Math.max(0, depth);
        }

        @android.webkit.JavascriptInterface
        public void share(String title, String text, String url) {
            String cuerpo = ((text == null ? "" : text) + "\n" + (url == null ? "" : url)).trim();
            Intent envio = new Intent(Intent.ACTION_SEND);
            envio.setType("text/plain");
            envio.putExtra(Intent.EXTRA_SUBJECT, title == null ? "" : title);
            envio.putExtra(Intent.EXTRA_TEXT, cuerpo);
            Intent selector = Intent.createChooser(envio, "Compartir ficha");
            runOnUiThread(() -> startActivity(selector));
        }

        @android.webkit.JavascriptInterface
        public void printPage() {
            runOnUiThread(() -> {
                PrintManager gestor = (PrintManager) getSystemService(PRINT_SERVICE);
                if (gestor == null) return;
                PrintDocumentAdapter adaptador = webView.createPrintDocumentAdapter("Ficha Alcolea");
                gestor.print("Ficha Alcolea", adaptador, new PrintAttributes.Builder().build());
            });
        }
    }
}
