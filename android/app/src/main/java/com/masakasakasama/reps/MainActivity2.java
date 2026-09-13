package com.masakasakasama.reps;

import android.content.Intent;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import java.nio.charset.StandardCharsets;

public class MainActivity2 extends MainActivity {
    private static final String PREFIX = "REPS_LEGACY_V1\n";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleLegacyShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLegacyShare(intent);
    }

    private void handleLegacyShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        if (!"text/plain".equals(intent.getType())) return;
        String shared = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (shared == null || !shared.startsWith(PREFIX)) return;

        String raw = shared.substring(PREFIX.length());
        String encoded = Base64.encodeToString(raw.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);

        WebView webView = findWebView(findViewById(android.R.id.content));
        if (webView == null) return;
        importWhenReady(webView, encoded, 0);
    }

    private void importWhenReady(WebView webView, String encoded, int attempt) {
        if (attempt > 30) return;
        webView.evaluateJavascript("typeof window.REPSLegacyImport !== 'undefined'", value -> {
            if ("true".equals(value)) {
                webView.evaluateJavascript("window.REPSLegacyImport.importBase64('" + encoded + "')", null);
            } else {
                webView.postDelayed(() -> importWhenReady(webView, encoded, attempt + 1), 200);
            }
        });
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (!(view instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) view;
        for (int i = 0; i < group.getChildCount(); i++) {
            WebView found = findWebView(group.getChildAt(i));
            if (found != null) return found;
        }
        return null;
    }
}
