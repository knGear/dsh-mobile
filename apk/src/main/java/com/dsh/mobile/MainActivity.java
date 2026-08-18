package com.dsh.mobile;

import android.app.Activity;
import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * dshm 壳 — 冷启动为唯一连接引擎
 *
 * 哲学(用户定稿): 全部行为收敛到冷启动一条线:
 *   冷启动 = 探测「最近验证过的连接」(默认本机 3080) → 通=进主界面 / 断=落地页。
 *   - 落地页(初始/离线)是最底层: 静态、无轮询、返回即退出程序; 从别处切回 = 再冷启动。
 *   - 引导页(GuideActivity, 设置入口): 独立透明页; 在那里连接他设备验证成功后,
 *     该实例成为冷启动目标, 此后冷启动直连它。
 *   - 验证成功 = onPageFinished(真实页面加载出来), 只有 dsh 真活着才算数。
 * ⚠ 老 d8 不支持 lambda — 一律匿名类。
 */
public class MainActivity extends Activity implements ShellBridge.Connector {

    private static final String FIRST_URL = "file:///android_asset/first.html";
    private static final String PREFS = "dshm";

    private WebView webView;
    private View container;
    private boolean landing = false; // 当前在落地页(初始/离线)
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 全面屏: 默认 edge-to-edge(内容入系统栏区, 壳监听 insets 做 padding)
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);
        container = findViewById(R.id.container);
        // applyFullscreen 必须在 container 初始化后调用: 它需要给 container 设 insets 监听器,
        // 否则 setDecorFitsSystemWindows(false) 让内容入了系统栏但 padding 没加上 → 侵入安全区
        applyFullscreen(getSharedPreferences("dshm", 0).getBoolean("fullscreen", true));

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // setMixedContentMode 是 API 21+(Android 5.0): Android 4.x 无此方法, 且 4.x 默认允许混合内容
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        // UA 标识: dshm-ui 插件据此识别本壳(注入移动 UI); 旧 mobile-ui 反向检测(互不干扰)
        try {
            String vn = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            s.setUserAgentString(s.getUserAgentString() + " DSHM/" + vn);
        } catch (Exception e) { /* UA 无标识, 插件退化为不激活 */ }
        webView.clearCache(true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage cm) {
                android.util.Log.w("DSH-JS", cm.message() + " @ " + cm.sourceId() + ":" + cm.lineNumber());
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // dshm:// scheme(dsh 页面里发起的 debug 按钮跳转) → 交系统解析回本壳
                Uri u = request.getUrl();
                if (u != null && "dshm".equals(u.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u));
                    } catch (Exception e) { /* 忽略 */ }
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith("http")) {
                    // 验证成功: 真实页面加载出来了 → 该实例成为冷启动目标(核心记忆点)
                    landing = false;
                    markUsed();
                    PendingConnection.set(sp(), originOf(url));
                    addHistoryFrom(url);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // 主文档失败 → 落地页(初始/离线由记录定)
                if (request.isForMainFrame() && !landing) showLanding();
            }
        });

        webView.addJavascriptInterface(new ShellBridge(this, this), "AndroidShell");
        routeIntent(getIntent());
    }

    // intent 路由:
    //  - open extra(引导页连接) → 直连目标
    //  - dshm://first?mode=xxx → debug 布局预览(设置-移动端-debug 按钮触发):
    //    直接渲染落地页三态之一; 返回键 = 回上一页(设置), 不退出
    //  - 其他 → 冷启动
    private boolean debugLanding = false; // debug 预览态: 返回 = finish 而非退出

    private void routeIntent(Intent it) {
        String open = it != null ? it.getStringExtra("open") : null;
        if (open != null && open.startsWith("http")) {
            landing = false;
            debugLanding = false;
            webView.loadUrl(open);
            return;
        }
        String data = (it != null && it.getData() != null) ? it.getData().toString() : null;
        if (data != null && data.startsWith("dshm://first")) {
            // mode 参数 → 落地页三态(init|offline|guide)
            String mode = "init";
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("mode=(init|offline|guide)").matcher(data);
            if (m.find()) mode = m.group(1);
            landing = true;
            debugLanding = true;
            handler.removeCallbacksAndMessages(null);
            webView.loadUrl(FIRST_URL + "?mode=" + mode);
            return;
        }
        debugLanding = false;
        coldStart();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        routeIntent(intent);
    }

    @Override
    public void onBackPressed() {
        // debug 布局预览: 返回 = WebView 历史回退到设置页(设置就在本 WebView 里)
        if (debugLanding) {
            debugLanding = false;
            if (webView.canGoBack()) webView.goBack();
            else coldStart();
            return;
        }
        // 落地页 = 最底层: 返回即退出; 应用页: 常规 WebView 后退/退出
        if (!landing && webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 哲学: 每次切回 = 冷启动(探测目标 → 通=重载进 / 断=落地页)。
        // 例外: debug 布局预览态(用户正在看排版, 不做探测)。
        // 引导页场景不经过这里(GuideActivity 覆盖时 Main 处于 onPause 不动)。
        // 通知权限态: 切回一锤子重查(页面 __refresh 钩子, 非轮询; dsh 页无此钩子=无感)
        handler.post(new Runnable() {
            @Override public void run() {
                if (webView == null) return;
                webView.evaluateJavascript("window.__refresh&&window.__refresh()", null);
                if (debugLanding) return;
                coldStart();
            }
        });
    }

    // ── 全面屏开关(移动设置-排障-全面屏优化): edge-to-edge 切换 ──────────

    // on=true: edge-to-edge(内容入系统栏区, 壳监听 insets 做 padding);
    // on=false: 默认安全区(系统自动避让, 壳零干预)
    void applyFullscreen(boolean on) {
        if (on) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            }
            if (container != null) {
                container.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                    @Override
                    public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                            android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                        } else {
                            v.setPadding(
                                insets.getSystemWindowInsetLeft(),
                                insets.getSystemWindowInsetTop(),
                                insets.getSystemWindowInsetRight(),
                                insets.getSystemWindowInsetBottom());
                        }
                        return insets;
                    }
                });
            }
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(true);
            } else {
                getWindow().getDecorView().setSystemUiVisibility(0);
            }
            if (container != null) {
                container.setPadding(0, 0, 0, 0);
                container.setOnApplyWindowInsetsListener(null);
            }
        }
    }

    // ── 冷启动(唯一连接引擎) ───────────────────────────────

    // 探测目标实例: 通 → 载入/重载; 断 → 落地页。无轮询, 一锤子探测。
    private void coldStart() {
        final String target = PendingConnection.get(sp());
        new Thread(new Runnable() {
            @Override public void run() {
                final boolean up = httpUp(target);
                handler.post(new Runnable() {
                    @Override public void run() {
                        if (up) {
                            landing = false;
                            String cur = webView.getUrl();
                            if (cur != null && cur.startsWith("http")
                                    && originOf(cur).equals(target)) {
                                webView.reload();
                            } else {
                                webView.loadUrl(target);
                            }
                        } else {
                            showLanding();
                        }
                    }
                });
            }
        }).start();
    }

    // ── 落地页(初始/离线, 最底层) ──────────────────────────

    private void showLanding() {
        landing = true;
        webView.loadUrl(FIRST_URL);
    }

    // HEAD 探测: 2xx~4xx 视为后端在(404/401 也说明 HTTP 层活着)
    static boolean httpUp(String url) {
        java.net.HttpURLConnection conn = null;
        try {
            conn = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            conn.setConnectTimeout(1500);
            conn.setReadTimeout(1500);
            conn.setRequestMethod("HEAD");
            int code = conn.getResponseCode();
            return code >= 200 && code < 500;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    static String originOf(String url) {
        try {
            Uri u = Uri.parse(url);
            int port = u.getPort();
            return u.getScheme() + "://" + u.getHost() + (port > 0 ? ":" + port : "") + "/";
        } catch (Exception e) {
            return url;
        }
    }

    // ── 偏好 ───────────────────────────────────────────────

    SharedPreferences sp() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    boolean usedBefore() {
        return sp().getBoolean("used_before", false);
    }

    private void markUsed() {
        sp().edit().putBoolean("used_before", true).apply();
    }

    String historyCsv() {
        return sp().getString("history", "");
    }

    // Connector: 落地页直接 open
    @Override
    public void open(String url) {
        handler.post(new Runnable() {
            @Override public void run() {
                landing = false;
                webView.loadUrl(url);
            }
        });
    }

    @Override
    public String titleKey() {
        return usedBefore() ? "offline" : "init";
    }

    @Override
    public String histJson() {
        StringBuilder b = new StringBuilder("[");
        boolean first = true;
        for (String p : historyCsv().split(",")) {
            if (p.isEmpty()) continue;
            if (!first) b.append(',');
            b.append('"').append(p).append('"');
            first = false;
        }
        return b.append(']').toString();
    }

    // http://host:port/ → "host:port" 入历史
    private void addHistoryFrom(String url) {
        try {
            Uri u = Uri.parse(url);
            String host = u.getHost();
            int port = u.getPort();
            if (host == null || port <= 0) return;
            addHistoryEntry(host + ":" + port);
        } catch (Exception e) { /* 忽略 */ }
    }

    void addHistoryEntry(String entry) {
        String cur = sp().getString("history", "");
        java.util.List<String> list = new java.util.ArrayList<String>();
        for (String p : cur.split(",")) {
            if (!p.isEmpty() && !p.equals(entry)) list.add(p);
        }
        list.add(0, entry);
        while (list.size() > 5) list.remove(list.size() - 1);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(list.get(i));
        }
        sp().edit().putString("history", sb.toString()).apply();
    }
}
