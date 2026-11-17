package com.jorgefausto.fichasalcolea;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
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
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Collections;

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
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimeType);
            request.addRequestHeader("User-Agent", userAgent);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    URLUtil.guessFileName(url, contentDisposition, mimeType));
            manager.enqueue(request);
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

    private class PuenteNativo {
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
