package com.masakasakasama.reps;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;

public class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://app.reps.local";
    private static final String APP_HOST = "app.reps.local";
    private static volatile boolean foreground = false;

    private WebView webView;

    public static boolean isInForeground() {
        return foreground;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(10, 10, 12));
        getWindow().setNavigationBarColor(Color.rgb(10, 10, 12));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(10, 10, 12));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setUserAgentString(settings.getUserAgentString() + " REPS-Android/0.5.2");

        webView.addJavascriptInterface(new RepsAndroidBridge(), "RepsAndroid");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!APP_HOST.equalsIgnoreCase(uri.getHost())) return null;

                String path = uri.getPath();
                if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                if (path.startsWith("/")) path = path.substring(1);

                try {
                    InputStream stream = getAssets().open(path);
                    return new WebResourceResponse(mimeType(path), "UTF-8", stream);
                } catch (IOException ignored) {
                    return new WebResourceResponse(
                            "text/plain",
                            "UTF-8",
                            404,
                            "Not Found",
                            null,
                            new java.io.ByteArrayInputStream(new byte[0])
                    );
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_HOST.equalsIgnoreCase(uri.getHost())) return false;

                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        requestNotificationPermission();
        requestExactAlarmPermission();
        RestAlarmReceiver.ensureNotificationChannel(this);

        webView.loadUrl(APP_ORIGIN + "/index.html");
    }

    private String mimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4101);
        }
    }

    private void requestExactAlarmPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;

        AlarmManager alarmManager =
                (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (alarmManager.canScheduleExactAlarms()) return;

        new AlertDialog.Builder(this)
                .setTitle("レスト通知を正確にする")
                .setMessage("60・90・120秒の終了通知を遅れにくくするため、「アラームとリマインダー」を許可してください。")
                .setNegativeButton("あとで", null)
                .setPositiveButton("設定を開く", (dialog, which) -> {
                    try {
                        Intent intent = new Intent(
                                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                                Uri.parse("package:" + getPackageName())
                        );
                        startActivity(intent);
                    } catch (Exception ignored) {
                    }
                })
                .show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        foreground = false;
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("RepsAndroid");
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private class RepsAndroidBridge {
        @JavascriptInterface
        public void scheduleRest(int seconds) {
            RestAlarmReceiver.schedule(MainActivity.this, seconds);
        }

        @JavascriptInterface
        public void cancelRest() {
            RestAlarmReceiver.cancel(MainActivity.this);
        }

        @JavascriptInterface
        public String platform() {
            return "android-apk-local";
        }
    }
}
