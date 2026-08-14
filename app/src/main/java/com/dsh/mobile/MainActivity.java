package com.dsh.mobile;

import android.app.Activity;
import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
import android.net.Uri;
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
        "display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center'>" +
        "<div style='max-width:420px;width:calc(100vw - 48px)'>" +
        "<div style='font-size:64px'>&#128011;</div>" +
        "<h2 style='margin:16px 0 8px;font-weight:600'>DSH 未启动</h2>" +
        "<p style='margin:0 0 18px;color:#8a8a99;line-height:1.7'>dsh web 未运行<br>" +
        "在 Termux 执行 <b style='color:#c8c8d8'>dsh-web</b> 启动后自动进入</p>" +
        // 输入框: 空=本地默认 127.0.0.1:3080, 纯 IP 自动补 :3080(doConnect 处理)
        "<div style='display:flex;gap:8px;margin-bottom:10px'>" +
        "<input id='host' placeholder='IP:端口' " +
        "style='flex:1;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid #3a3a4a;" +
        "background:#16161f;color:#e6e6ef;font-size:14px;outline:none'>" +
        "<button onclick=\"doConnect()\" " +
        "style='padding:10px 18px;border-radius:8px;border:none;background:#4f7cff;color:#fff;font-size:14px'>连接</button>" +
        "</div>" +
        // 远程连接记录(上限 5, 与输入框同宽)
        "<div id='hist' style='display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;width:100%;box-sizing:border-box'></div>" +
        // GitHub 仓库 / 最新 Termux 下载 / 一键启动(精简入口)
        "<div style='display:flex;gap:8px;margin:0 0 18px;justify-content:center;flex-wrap:wrap'>" +
        "<button onclick=\"AndroidShell.openUrl('https://github.com/knGear/dsh-mobile')\" " +
        "style='padding:8px 16px;border-radius:999px;border:1px solid #3a3a4a;background:transparent;color:#e6e6ef;font-size:13px'>GitHub 仓库</button>" +
        "<button onclick=\"AndroidShell.openTermuxDownload()\" " +
        "style='padding:8px 16px;border-radius:999px;border:1px solid #3a3a4a;background:transparent;color:#e6e6ef;font-size:13px'>下载 Termux（F-Droid）</button>" +
        "<button onclick=\"AndroidShell.launchTermuxStart()\" " +
        "style='padding:8px 16px;border-radius:999px;border:none;background:#4f7cff;color:#fff;font-size:13px'>一键启动</button>" +
        "</div>" +
        // 安装区: 安装方式两行(左文案 + 右按钮)
        "<div style='text-align:left'>" +
        "<div style='display:flex;align-items:center;gap:8px;margin-bottom:8px'>" +
        "<span style='font-size:13px;color:#c8c8d8;flex:1'>安装于 Termux</span>" +
        "<button onclick=\"AndroidShell.launchTermuxInstall('dsh-install-termux.sh')\" " +
        "style='padding:7px 14px;border-radius:8px;border:none;background:#4f7cff;color:#fff;font-size:13px'>一键安装</button>" +
        "<button onclick=\"AndroidShell.copyInstallCommand('dsh-install-termux.sh')\" " +
        "style='padding:7px 14px;border-radius:8px;border:1px solid #3a3a4a;background:transparent;color:#e6e6ef;font-size:13px'>复制指令</button>" +
        "</div>" +
        "<div style='display:flex;align-items:center;gap:8px'>" +
        "<span style='font-size:13px;color:#c8c8d8;flex:1'>安装于 Termux-Ubuntu</span>" +
        "<button onclick=\"AndroidShell.launchTermuxInstall('dsh-install-linux.sh')\" " +
        "style='padding:7px 14px;border-radius:8px;border:none;background:#4f7cff;color:#fff;font-size:13px'>一键安装</button>" +
        "<button onclick=\"AndroidShell.copyInstallCommand('dsh-install-linux.sh')\" " +
        "style='padding:7px 14px;border-radius:8px;border:1px solid #3a3a4a;background:transparent;color:#e6e6ef;font-size:13px'>复制指令</button>" +
        "</div></div>" +
        "<script>" +
        "function doConnect(){" +
        "var v=document.getElementById('host').value.trim();" +
        "if(!v){v='127.0.0.1:3080';}" +
        "else if(!/^[a-zA-Z0-9.\\-]+:\\d{1,5}$/.test(v)){v=v+':3080';}" +
        "AndroidShell.connect(v);}" +
        "function renderHist(){" +
        "try{var l=JSON.parse(AndroidShell.getRemoteHistory()||'[]');" +
        "var b=document.getElementById('hist');b.innerHTML='';" +
        "for(var i=0;i<l.length;i++){(function(h){" +
        "var c=document.createElement('button');c.textContent=h;" +
        "c.style.cssText='padding:5px 10px;border-radius:999px;border:1px solid #3a3a4a;" +
        "background:#1a1a24;color:#c8c8d8;font-size:12px;cursor:pointer;';" +
        "c.onclick=function(){AndroidShell.connect(h);};b.appendChild(c);})(l[i]);}}" +
        "catch(e){}}" +
        "renderHist();" +
        "</script>" +
        "</div></body></html>";

    private WebView webView;
    private View container;
    private boolean offline = false;
    private boolean offlinePending = false; // 15s 宽限探测中
    // 全面屏(edge-to-edge)开关 + 上下安全区偏移(dp, -10~10, 0=系统原生 insets)
    private boolean edgeToEdge = true;
    private int insetTopOffset = 0;
    private int insetBottomOffset = 0;
    // 手动进入离线页模式: 不自动探测回跳(等用户操作退出)
    private volatile boolean manualOffline = false;
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
        // IME 键盘 insets 也并入底部 padding: edge-to-edge 下系统不会自动收缩视口给键盘,
        // 不处理的话 composer 被键盘盖住(输入框不动/只上抬一半), 直到输入字符才触发重排恢复。
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
                    android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                    // 底部取 bars 与 ime 的较大值(键盘弹出时 ime 已含手势条区域, 相加会多出一段空隙),
                    // 偏移统一加在基线上: 键盘态=键盘高+偏移, 常态=手势条高+偏移
                    int baseBottom = Math.max(bars.bottom, ime.bottom);
                    v.setPadding(bars.left,
                                 Math.max(0, bars.top + Math.round(insetTopOffset * density)),
                                 bars.right,
                                 Math.max(0, baseBottom + Math.round(insetBottomOffset * density)));
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
                // 记录远程连接历史(非本机才记, 上限 5)
                if (!target.startsWith("127.0.0.1") && !target.startsWith("localhost")) {
                    addRemoteHistory(target);
                }
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        offline = false;
                        manualOffline = false;
                        offlinePending = false;
                        handler.removeCallbacks(offlineCheck);
                        webView.loadUrl(url);
                    }
                });
            }

            // 打开外链(GitHub 仓库), 仅允许 https
            @JavascriptInterface
            public void openUrl(String url) {
                final String u = url == null ? "" : url.trim();
                if (!u.startsWith("https://")) return;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
                        } catch (Exception e) {
                            Toast.makeText(getApplicationContext(), "无法打开链接", Toast.LENGTH_SHORT).show();
                        }
                    }
                });
            }

            // 最新 Termux 下载: 查 F-Droid API 拿最新 versionCode, 拼 APK 直链拉起浏览器直接下载
            @JavascriptInterface
            public void openTermuxDownload() {
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        String url = "https://f-droid.org/packages/com.termux/"; // 兜底: 商店页
                        try {
                            HttpURLConnection conn = (HttpURLConnection)
                                new URL("https://f-droid.org/api/v1/packages/com.termux").openConnection();
                            conn.setConnectTimeout(5000);
                            conn.setReadTimeout(5000);
                            InputStream in = conn.getInputStream();
                            ByteArrayOutputStream out = new ByteArrayOutputStream();
                            byte[] buf = new byte[4096];
                            int n;
                            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                            in.close();
                            conn.disconnect();
                            String json = out.toString("UTF-8");
                            java.util.regex.Matcher m = java.util.regex.Pattern
                                .compile("\"suggestedVersionCode\"\\s*:\\s*(\\d+)").matcher(json);
                            if (m.find()) {
                                url = "https://f-droid.org/repo/com.termux_" + m.group(1) + ".apk";
                            }
                        } catch (Exception e) { /* 保持兜底商店页 */ }
                        final String u = url;
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
                                } catch (Exception e2) {
                                    Toast.makeText(getApplicationContext(), "无法打开下载链接", Toast.LENGTH_SHORT).show();
                                }
                            }
                        });
                    }
                }).start();
            }

            // 复制一键安装指令(白名单脚本): curl 下载并执行, 粘贴到 Termux 即可
            @JavascriptInterface
            public void copyInstallCommand(String script) {
                final String s = (script == null ? "" : script.trim());
                if (!s.equals("dsh-install-termux.sh") && !s.equals("dsh-install-linux.sh")) return;
                final String cmd = "curl -fsSL https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/"
                    + s + " -o $HOME/" + s + " && bash $HOME/" + s;
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("dsh install command", cmd));
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(getApplicationContext(), "安装指令已复制，粘贴到 Termux 执行即可", Toast.LENGTH_SHORT).show();
                    }
                });
            }

            // 远程连接历史(JSON 数组, 最多 5 条, 最新在前)
            @JavascriptInterface
            public String getRemoteHistory() {
                SharedPreferences sp = getSharedPreferences("dsh_shell", MODE_PRIVATE);
                String cur = sp.getString("remote_history", "");
                String[] parts = cur.split(",");
                StringBuilder sb = new StringBuilder("[");
                boolean first = true;
                for (String p : parts) {
                    if (p.isEmpty()) continue;
                    if (!first) sb.append(',');
                    sb.append('"').append(p).append('"');
                    first = false;
                }
                sb.append(']');
                return sb.toString();
            }

            @JavascriptInterface
            public void addRemoteHistory(String host) {
                if (host == null || host.isEmpty()) return;
                SharedPreferences sp = getSharedPreferences("dsh_shell", MODE_PRIVATE);
                String cur = sp.getString("remote_history", "");
                String[] parts = cur.split(",");
                java.util.List<String> list = new java.util.ArrayList<String>();
                for (String p : parts) if (!p.isEmpty() && !p.equals(host)) list.add(p);
                list.add(0, host);
                while (list.size() > 5) list.remove(list.size() - 1);
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < list.size(); i++) {
                    if (i > 0) sb.append(',');
                    sb.append(list.get(i));
                }
                sp.edit().putString("remote_history", sb.toString()).apply();
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

            // 手动进入离线页(设置里"进入离线页"按钮): 显示 DSH 未启动页,
            // 可远程连接 IP:端口 或复制一键安装脚本。手动模式不自动探测回跳,
            // 由用户点"本机重试"(走 connect)或输入远程地址退出。
            @JavascriptInterface
            public void showOfflinePage() {
                manualOffline = true;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        showOffline();
                    }
                });
            }

            // 拉起 Termux 一键启动后端: 执行 dsh-web(统一命令, 原生/Ubuntu 均已注册)
            @JavascriptInterface
            public void launchTermuxStart() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            if (!ensureTermuxRunCommandPermission()) return;
                            startService(termuxRunCommand(new String[]{
                                "-c",
                                "if [ -x /data/data/com.termux/files/usr/bin/dsh-web ]; then exec /data/data/com.termux/files/usr/bin/dsh-web; else echo '未安装 dsh-web, 请先安装 dsh'; fi"
                            }));
                        } catch (Exception e) {
                            Toast.makeText(getApplicationContext(),
                                "拉起失败：请检查 Termux 设置里是否已允许外部应用执行命令", Toast.LENGTH_LONG).show();
                        }
                    }
                });
            }

            // 拉起 Termux 一键安装: com.termux.RUN_COMMAND 自动执行安装脚本
            // (先 curl 下载到 Termux home 再执行)。script 仅限白名单内两个脚本。
            @JavascriptInterface
            public void launchTermuxInstall(String script) {
                final String s = (script == null ? "" : script.trim());
                if (!s.equals("dsh-install-termux.sh") && !s.equals("dsh-install-linux.sh")) return;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            if (!ensureTermuxRunCommandPermission()) return;
                            startService(termuxRunCommand(new String[]{
                                "-c",
                                "curl -fsSL https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/" + s + " -o $HOME/" + s + " && bash $HOME/" + s
                            }));
                        } catch (Exception e) {
                            Toast.makeText(getApplicationContext(),
                                "拉起失败：请检查 Termux 设置里是否已允许外部应用执行命令", Toast.LENGTH_LONG).show();
                        }
                    }
                });
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

        // 初始化索要通知权限(Android 13+): 通知推送(会话状态/完成提醒)依赖此授权
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
            }
        }
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

    // Termux RUN_COMMAND 意图(自适应): Termux 0.118+ 是 RunCommandService(非 Activity!),
    // 优先标准包名 com.termux, 解析不到时退回 action 自动匹配(兼容变体/fork)。
    private Intent termuxRunCommand(String[] args) {
        Intent i = new Intent("com.termux.RUN_COMMAND");
        i.putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash");
        i.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", args);
        i.putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home");
        i.setClassName("com.termux", "com.termux.app.RunCommandService");
        if (resolveService(i) == null) {
            i = new Intent("com.termux.RUN_COMMAND");
            i.putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash");
            i.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", args);
            i.putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home");
        }
        return i;
    }

    private android.content.pm.ResolveInfo resolveService(Intent i) {
        try {
            return getPackageManager().resolveService(i, 0);
        } catch (Exception e) {
            return null;
        }
    }

    // 检查/请求 Termux RUN_COMMAND 权限(dangerous), 未授予返回 false
    private boolean ensureTermuxRunCommandPermission() {
        if (checkSelfPermission("com.termux.permission.RUN_COMMAND") == PackageManager.PERMISSION_GRANTED) {
            return true;
        }
        requestPermissions(new String[]{"com.termux.permission.RUN_COMMAND"}, 1002);
        return false;
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
            if (!offline || manualOffline) return; // 手动进入离线页: 不自动回跳
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
