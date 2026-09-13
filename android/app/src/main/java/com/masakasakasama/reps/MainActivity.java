package com.masakasakasama.reps;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String SITE_URL = "https://masakasakasama.github.io/Fitness/";
    private static final String SITE_HOST = "masakasakasama.github.io";
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
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " REPS-Android/0.4.1");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        webView.addJavascriptInterface(new RepsAndroidBridge(), "RepsAndroid");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme())
                        && SITE_HOST.equalsIgnoreCase(uri.getHost())) {
                    return false;
                }

                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        requestNotificationPermission();
        RestAlarmReceiver.ensureNotificationChannel(this);
        webView.loadUrl(SITE_URL);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4101);
        }
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
            return "android-apk";
        }
    }
}
