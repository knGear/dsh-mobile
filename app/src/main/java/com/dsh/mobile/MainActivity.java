package com.dsh.mobile;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.content.Intent;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * DSH Web 浏览器壳
 * 目标: http://127.0.0.1:3080 (dsh web)
 * 特性: 状态栏可见(深色一体化) + 安全区适配 + 离线自动重试
 */
public class MainActivity extends Activity {

    private static final String HOME_URL = "http://127.0.0.1:3080/";

    private static final String OFFLINE_HTML =
        "<html><head><meta charset='utf-8'>" +
        "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
        "</head>" +
        "<body style='margin:0;background:#151517;color:#e6e6ef;font-family:sans-serif;" +
        "display:flex;align-items:center;justify-content:center;height:100vh;text-align:center'>" +
        "<div style='max-width:420px;width:calc(100vw - 48px)'>" +
        "<div style='font-size:64px'>&#128011;</div>" +
        "<h2 style='margin:16px 0 8px;font-weight:600'>DSH 未启动</h2>" +
        "<p style='margin:0 0 18px;color:#8a8a99;line-height:1.7'>dsh web 未运行<br>" +
        "在 Termux 执行 <b style='color:#c8c8d8'>dsh-web</b> 启动后自动进入</p>" +
        "<div style='display:flex;gap:8px;margin-bottom:10px'>" +
        "<input id='host' placeholder='IP:端口（空=127.0.0.1:3080）' " +
        "style='flex:1;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid #3a3a4a;" +
        "background:#16161f;color:#e6e6ef;font-size:14px;outline:none'>" +
        "<button onclick=\"AndroidShell.connect(document.getElementById('host').value)\" " +
        "style='padding:10px 18px;border-radius:8px;border:none;background:#4f7cff;color:#fff;font-size:14px'>连接</button>" +
        "</div>" +
        "<div style='display:flex;gap:8px;justify-content:center'>" +
        "<a href='http://127.0.0.1:3080/' style='display:inline-block;padding:10px 24px;" +
        "border:1px solid #3a3a4a;border-radius:999px;color:#e6e6ef;text-decoration:none'>本机重试</a>" +
        "<button onclick=\"AndroidShell.copyInstallScript()\" " +
        "style='padding:10px 24px;border-radius:999px;border:1px solid #3a3a4a;background:transparent;color:#e6e6ef;font-size:14px'>复制安装脚本</button>" +
        "</div>" +
        "<p style='margin:14px 0 0;color:#6a6a78;font-size:12px'>复制安装脚本 → 粘贴到任意 Termux 即可一键安装后端</p>" +
        "</div></body></html>";

    private WebView webView;
    private View container;
    private boolean offline = false;
    private boolean offlinePending = false; // 15s 宽限探测中
    // 全面屏(edge-to-edge)开关 + 上下安全区偏移(dp, -10~10, 0=系统原生 insets)
    private boolean edgeToEdge = true;
    private int insetTopOffset = 0;
    private int insetBottomOffset = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 透明系统栏(颜色由页面/容器背景透出)
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        // 读取偏好: 全面屏开关 + 上下偏移
        SharedPreferences sp = getSharedPreferences("dsh_shell", MODE_PRIVATE);
        edgeToEdge = sp.getBoolean("edge", true);
        insetTopOffset = sp.getInt("top", 0);
        insetBottomOffset = sp.getInt("bottom", 0);
        applyDecorFits();

        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);
        container = findViewById(R.id.container);

        // 标准全面屏 insets 处理: 系统栏 insets + 偏移作为 padding 应用到容器,
        // WebView 视口自动缩小避开状态栏/手势条/挖孔。关闭全面屏时交给系统默认内缩。
        container.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                float density = getResources().getDisplayMetrics().density;
                if (!edgeToEdge) {
                    v.setPadding(0, 0, 0, 0);
                    return insets;
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                    v.setPadding(bars.left,
                                 Math.max(0, bars.top + Math.round(insetTopOffset * density)),
                                 bars.right,
                                 Math.max(0, bars.bottom + Math.round(insetBottomOffset * density)));
                } else {
                    v.setPadding(insets.getSystemWindowInsetLeft(),
                                 Math.max(0, insets.getSystemWindowInsetTop() + Math.round(insetTopOffset * density)),
                                 insets.getSystemWindowInsetRight(),
                                 Math.max(0, insets.getSystemWindowInsetBottom() + Math.round(insetBottomOffset * density)));
                }
                return insets;
            }
        });

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        // 本地服务 + bundle rev 查询参数已经保证新鲜度; 禁用 HTTP 缓存, 杜绝旧 HTML/旧 JS
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.clearCache(true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // 页面加载成功, 取消在途的离线宽限探测
                if (offlinePending) {
                    offlinePending = false;
                    handler.removeCallbacks(offlineCheck);
                }
                if (url != null && url.startsWith("http")) {
                    injectTouchCss(view);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) scheduleOfflineCheck();
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (failingUrl == null || failingUrl.startsWith(HOME_URL)) scheduleOfflineCheck();
            }
        });

        // 离线页能力: 远程连接(IP:端口) + 复制一键安装脚本
        // 注意: 老 d8 不支持 lambda(metafactory), 一律用匿名类
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void connect(String host) {
                final String h = host == null ? "" : host.trim();
                final String target = h.isEmpty() ? "127.0.0.1:3080" : h;
                if (!target.matches("[a-zA-Z0-9.\\-]+:\\d{1,5}")) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(getApplicationContext(), "格式应为 IP:端口", Toast.LENGTH_SHORT).show();
                        }
                    });
                    return;
                }
                final String url = "http://" + target + "/";
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        offline = false;
                        offlinePending = false;
                        handler.removeCallbacks(offlineCheck);
                        webView.loadUrl(url);
                    }
                });
            }

            // 全面屏开关 + 上下偏移(json: {enabled, top, bottom}, top/bottom 为 -10~10 dp)
            @JavascriptInterface
            public void setEdgeToEdge(String json) {
                try {
                    org.json.JSONObject o = new org.json.JSONObject(json);
                    if (o.has("enabled")) edgeToEdge = o.optBoolean("enabled", true);
                    if (o.has("top")) insetTopOffset = o.optInt("top", 0);
                    if (o.has("bottom")) insetBottomOffset = o.optInt("bottom", 0);
                    SharedPreferences sp = getSharedPreferences("dsh_shell", MODE_PRIVATE);
                    sp.edit().putBoolean("edge", edgeToEdge)
                            .putInt("top", insetTopOffset)
                            .putInt("bottom", insetBottomOffset).apply();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            applyDecorFits();
                            if (container != null) container.requestApplyInsets();
                        }
                    });
                } catch (Exception e) { /* 忽略 */ }
            }

            @JavascriptInterface
            public String getEdgeToEdge() {
                return "{\"enabled\":" + edgeToEdge + ",\"top\":" + insetTopOffset
                    + ",\"bottom\":" + insetBottomOffset + "}";
            }

            // 统一底色: web 层把实际背景色(如 #151517)上报, 壳把容器/系统栏底色设为同色,
            // 使上下安全区与页面内容底色一致(支持深/浅主题切换)。
            @JavascriptInterface
            public void setBackgroundColor(String color) {
                try {
                    final int c = Color.parseColor(color);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (container != null) container.setBackgroundColor(c);
                            getWindow().setStatusBarColor(c);
                            getWindow().setNavigationBarColor(c);
                        }
                    });
                } catch (Exception e) { /* 忽略 */ }
            }

            @JavascriptInterface
            public void copyInstallScript() {
                try {
                    InputStream in = getResources().openRawResource(R.raw.install_backend);
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    in.close();
                    final String script = out.toString("UTF-8");
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(ClipData.newPlainText("dsh install script", script));
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(getApplicationContext(),
                                "安装脚本已复制，粘贴到 Termux 执行即可", Toast.LENGTH_SHORT).show();
                        }
                    });
                } catch (Exception e) {
                    final String msg = e.getMessage();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(getApplicationContext(), "复制失败: " + msg, Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            }
        }, "AndroidShell");

        webView.loadUrl(initialUrl());
    }

    // 全面屏(edge-to-edge)开关: 开=内容绘制到系统栏后面(insets 监听负责内边距+偏移);
    // 关=系统默认, 内容自动避开系统栏。
    private void applyDecorFits() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(!edgeToEdge);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                edgeToEdge
                    ? (View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                       | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                       | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
                    : 0);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = intent.getStringExtra("url");
        if (webView != null && url != null && url.startsWith("http")) webView.loadUrl(url);
    }

    private String initialUrl() {
        String url = getIntent().getStringExtra("url");
        return (url != null && url.startsWith("http")) ? url : HOME_URL;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacks(offlineCheck);
        handler.removeCallbacks(retryProbe);
    }

    // ── 触屏适配: 隐藏桌面端 hover tooltip(点击残留的元凶) ────────
    // [role=tooltip] 是语义属性, 非 dsh hash 类名, 升级不碎。
    // @media (hover:none) 只命中无鼠标的触屏, 桌面浏览器不受影响。
    private void injectTouchCss(WebView view) {
        view.evaluateJavascript(
            "(function(){try{" +
            "if(document.getElementById('dsh-touch-css'))return;" +
            "var s=document.createElement('style');s.id='dsh-touch-css';" +
            "s.textContent='@media (hover:none){[role=tooltip]{display:none!important}}';" +
            "document.head.appendChild(s);" +
            "}catch(e){}})()", null);
    }

    // ── 离线自动重试 ────────────────────────────────────────

    // 连接失败先给 15s 宽限: 服务器(重启中)回来自动重载, 仍未起才进离线页
    private final Runnable offlineCheck = new Runnable() {
        @Override
        public void run() {
            offlinePending = false;
            if (offline) return;
            if (isDshUp()) {
                webView.loadUrl(HOME_URL);
            } else {
                showOffline();
            }
        }
    };

    private void scheduleOfflineCheck() {
        if (offline || offlinePending) return;
        offlinePending = true;
        handler.postDelayed(offlineCheck, 15000);
    }

    private void showOffline() {
        if (offline) return;
        offline = true;
        webView.loadDataWithBaseURL(HOME_URL, OFFLINE_HTML, "text/html", "UTF-8", null);
        handler.postDelayed(retryProbe, 3000);
    }

    private final Runnable retryProbe = new Runnable() {
        @Override
        public void run() {
            if (!offline) return;
            if (isDshUp()) {
                offline = false;
                webView.loadUrl(HOME_URL);
            } else {
                handler.postDelayed(this, 3000);
            }
        }
    };

    private boolean isDshUp() {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(HOME_URL).openConnection();
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
}
