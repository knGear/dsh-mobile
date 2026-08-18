package com.dshm;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * 引导页(设置-移动端-进入引导页, dshm://guide) — 独立透明页, 覆盖在 dsh 设置上。
 *
 * 哲学(用户定稿): 静态信息页, 切回什么都不发生, 返回 = 销毁回设置(右上角 ✕ 同效)。
 * 在这里连接他设备(3081/局域网 IP): 注销本页, 转交 MainActivity 直连目标;
 * 目标 onPageFinished 验证成功后成为冷启动目标, 此后冷启动直连它。
 */
public class GuideActivity extends Activity implements ShellBridge.Connector {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        setContentView(R.layout.activity_guide);

        WebView webView = findViewById(R.id.guide_web);
        web = webView;
        // 全面屏方案 v3: 回归系统默认安全区(与 Main 一致, 无 insets 监听)

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage cm) {
                android.util.Log.w("DSH-JS", cm.message() + " @ " + cm.sourceId() + ":" + cm.lineNumber());
                return true;
            }
        });
        // 桥: connect → 注销 + 转交 Main; close(✕) → 直接注销
        webView.addJavascriptInterface(new GuideShell(this, this), "AndroidShell");
        webView.loadUrl("file:///android_asset/first.html?guide=1");
    }

    // Connector: 连接 = 销毁本页 + 转交 Main 直连(验证成功由 Main.onPageFinished 记目标)
    @Override
    public void open(String url) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Intent it = new Intent(GuideActivity.this, MainActivity.class);
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                it.putExtra("open", url);
                startActivity(it);
                finish();
            }
        });
    }

    @Override
    public String titleKey() {
        return "guide";
    }

    @Override
    public String histJson() {
        SharedPreferences sp = getSharedPreferences("dshm", MODE_PRIVATE);
        StringBuilder b = new StringBuilder("[");
        boolean first = true;
        for (String p : sp.getString("history", "").split(",")) {
            if (p.isEmpty()) continue;
            if (!first) b.append(',');
            b.append('"').append(p).append('"');
            first = false;
        }
        return b.append(']').toString();
    }

    // ✕/返回: 销毁回设置
    void dismiss() {
        finish();
    }

    // 切回 = 探测冷启动目标: 断 → 销毁本页 + 拉起 Main(其冷启动自然落离线页, 替掉僵死设置);
    // 通 → 什么都不做(保持引导页安静)。用户拍板的降级逻辑。
    // 通知权限态: 切回一锤子重查(页面 __refresh 钩子, 非轮询)。
    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.__refresh&&window.__refresh()", null);
        final String target = PendingConnection.get(
            getSharedPreferences("dshm", MODE_PRIVATE));
        new Thread(new Runnable() {
            @Override public void run() {
                final boolean up = MainActivity.httpUp(target);
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        if (up || isFinishing()) return;
                        Intent it = new Intent(GuideActivity.this, MainActivity.class);
                        it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                        startActivity(it);
                        finish();
                    }
                });
            }
        }).start();
    }
}
