package com.dsh.mobile;

import android.content.ClipData;
import android.graphics.Color;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * JS 桥(初始页 ⇄ 壳) — 只提供平台动作原语, 页面逻辑全在 first.html。
 * 命令白名单单一真源在壳侧 COMMANDS: 页面传 cmdId, 文本经 getCommand 取 — 改命令只改一处。
 * 交互: 蓝下划线→openUrl/openTermuxDownload(浏览器); 青色按钮/代码块→点击 copyText(气泡全文),
 *       长按 runInTermux(cmdId)。
 */
class ShellBridge {

    /** 宿主差异点: 落地页(Main)直接 open; 引导页(Guide)注销自身转交 Main */
    interface Connector {
        void open(String url);
        String titleKey();
        String histJson();
    }

    private final android.app.Activity act;
    private final Connector hostC;

    /**
     * Termux 命令白名单: id → {显示/复制文本, 拉起执行命令(空=同显示), 会话模式}
     * 显示文本保持用户要的原样(如 dsh-web); 修饰只存在于拉起执行层。
     * 会话模式: "fg"=切到 Termux 会话前台(安装类, 看进度) / "bg"=留在本应用(服务类)。
     */
    private static final String[][] COMMANDS = {
        {"install-termux",
         "curl -fsSL https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/dsh-install-termux.sh"
         + " -o $HOME/dsh-install-termux.sh && bash $HOME/dsh-install-termux.sh", "", "fg"},
        {"install-linux",
         "curl -fsSL https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/dsh-install-linux.sh"
         + " -o $HOME/dsh-install-linux.sh && bash $HOME/dsh-install-linux.sh", "", "fg"},
        // 常驻服务守护化拉起(对齐原版 dsh-web 观感与就绪语义):
        // 切到 Termux 打印「正在启动 dsh-web ...」+ 进度点, setsid 脱离会话启动 node(PPID=1),
        // 等待真正就绪(HTTP 200, 最长 20s)才「✓ 就绪」并 termux-open-url 跳回 dshm —
        // 跳回即热服务, 规避 WebView 抢跑连上冷后端导致 dsh web 前端反复断连重试。
        // 幂等: 已在运行直接提示跳回。超时: 打日志尾部仍跳回(壳内 1s 轮询会接住)。
        {"dsh-web", "dsh-web",
         "termux-wake-lock 2>/dev/null;"
         + " if curl -s -o /dev/null --max-time 1 http://127.0.0.1:3080/;"
         + " then echo '✓ dsh web 已在运行'; sleep 1;"
         + " else echo '正在启动 dsh-web ...'; mkdir -p $HOME/.cache;"
         + " setsid nohup node --expose-internals"
         + " /data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js"
         + " web >> $HOME/.cache/dsh-web.log 2>&1 &"
         + " ok=0; for i in $(seq 1 20); do sleep 1;"
         + " if curl -s -o /dev/null --max-time 1 http://127.0.0.1:3080/; then ok=1; break; fi;"
         + " echo -n '.'; done; echo;"
         + " if [ \"$ok\" = 1 ]; then echo '✓ 就绪';"
         + " else echo '✗ 启动较慢, 回壳内稍候自动连接'; tail -3 $HOME/.cache/dsh-web.log; fi; fi;"
         + " termux-open-url 'dshm://back' 2>/dev/null; exit 0", "fg"},
        // 四档自救(遇到困难?): 原版验证安装 = npm 无损重装官方 dsh, 还原一切 diff, ~/.dsh 全保留
        {"dsh-reinstall",
         "curl -fsSL https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/dsh-reinstall.sh"
         + " -o $HOME/dsh-reinstall.sh && bash $HOME/dsh-reinstall.sh", "", "fg"},
        // 清洁重装(最重/敏感): 备份 sessions+key → 清空 ~/.dsh → 全新安装 → 恢复
        {"dsh-repair",
         "curl -fsSL https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/dsh-repair.sh"
         + " -o $HOME/dsh-repair.sh && bash $HOME/dsh-repair.sh", "", "fg"},
        // dsh 更新: 快速更新脚本(仅 npm+修补+wrapper, 长按执行)
        {"dsh-update",
         "curl -fsSL https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/dsh-update-termux.sh"
         + " -o $HOME/dsh-update-termux.sh && bash $HOME/dsh-update-termux.sh", "", "fg"},
        {"allow-external",
         "echo allow-external-apps=true > ~/.termux/termux.properties && termux-reload-settings", "", "bg"},
    };

    ShellBridge(android.app.Activity a, Connector c) {
        act = a;
        hostC = c;
    }

    private static String commandOf(String id) {
        if (id == null) return null;
        for (String[] c : COMMANDS) if (c[0].equals(id)) return c[1];
        return null;
    }

    /** 拉起执行文本(第3列, 空=同显示文本) */
    private static String launchTextOf(String id) {
        if (id == null) return null;
        for (String[] c : COMMANDS) {
            if (c[0].equals(id)) return (c.length > 2 && c[2] != null && !c[2].isEmpty()) ? c[2] : c[1];
        }
        return null;
    }

    /** 会话动作(第4列): "fg"→0 切到会话前台 / "bg"→1 留在当前应用 / 其他→-1 不设 */
    private static int sessionActionOf(String id) {
        if (id == null) return -1;
        for (String[] c : COMMANDS) {
            if (c[0].equals(id)) {
                if (c.length > 3 && "fg".equals(c[3])) return 0;
                if (c.length > 3 && "bg".equals(c[3])) return 1;
                return -1;
            }
        }
        return -1;
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    // 页面状态: 语言 / 页面种类(init|offline|guide, 宿主定) / 连接历史(宿主定)
    @JavascriptInterface
    public String getStatus() {
        boolean en = java.util.Locale.getDefault().getLanguage().startsWith("en");
        return "{\"lang\":\"" + (en ? "en" : "zh") + "\""
            + ",\"titleKey\":\"" + hostC.titleKey() + "\""
            + ",\"hist\":" + hostC.histJson() + "}";
    }

    // 命令文本(白名单内) — 页面复制与气泡显示用
    @JavascriptInterface
    public String getCommand(String id) {
        String c = commandOf(id);
        return c == null ? "" : esc(c);
    }

    // 连接(输入规范化在页面完成, 这里只校验 host:port)
    @JavascriptInterface
    public void connect(String host) {
        final String h = host == null ? "" : host.trim();
        final String target = h.isEmpty() ? "127.0.0.1:3080" : h;
        if (!target.matches("[a-zA-Z0-9.\\-]+:\\d{1,5}")) {
            act.runOnUiThread(new Runnable() {
                @Override public void run() {
                    Toast.makeText(act, act.getString(R.string.toast_ip_port), Toast.LENGTH_SHORT).show();
                }
            });
            return;
        }
        hostC.open("http://" + target + "/");
    }

    // 打开外链(仅 https)
    @JavascriptInterface
    public void openUrl(String url) {
        final String u = url == null ? "" : url.trim();
        if (!u.startsWith("https://")) return;
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    act.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
                } catch (Exception e) {
                    Toast.makeText(act, act.getString(R.string.toast_open_fail), Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    // 拉起系统浏览器打开当前连接的服务(不硬编码, 由页面传 window.location.href)
    // 仅 http(s), 转交系统浏览器 = 脱离壳/注入的原版体验
    @JavascriptInterface
    public void openInBrowser(String url) {
        final String u = url == null ? "" : url.trim();
        if (!u.startsWith("http://") && !u.startsWith("https://")) return;
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    Intent it = new Intent(Intent.ACTION_VIEW, Uri.parse(u));
                    it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    act.startActivity(it);
                } catch (Exception e) {
                    Toast.makeText(act, act.getString(R.string.toast_open_fail), Toast.LENGTH_SHORT).show();
                }
            }
        });
    }


    // 全面屏开关: 存 pref + 运行时切换 edge-to-edge(decorFitsSystemWindows)
    @JavascriptInterface
    public void setFullscreen(boolean on) {
        try {
            act.getSharedPreferences("dshm", 0).edit().putBoolean("fullscreen", on).apply();
            ((MainActivity) act).applyFullscreen(on);
        } catch (Exception e) { /* 忽略 */ }
    }

    @JavascriptInterface
    public boolean getFullscreen() {
        try {
            return act.getSharedPreferences("dshm", 0).getBoolean("fullscreen", true);
        } catch (Exception e) { return true; }
    }

    // 动态同步容器背景色: 页面背景读出后传给壳, 壳设 container 底色 = 页面底色,
    // 消除 edge-to-edge padding 区(系统栏)与 WebView 内容区的色差隔断
    @JavascriptInterface
    public void setBackgroundColor(final String hex) {
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    int color = Color.parseColor(hex);
                    android.view.View c = act.findViewById(R.id.container);
                    if (c != null) c.setBackgroundColor(color);
                } catch (Exception e) { /* 忽略 */ }
            }
        });
    }

    // Termux 下载: F-Droid API 查最新 versionCode 拼直链, 失败兜底商店页
    @JavascriptInterface
    public void openTermuxDownload() {
        new Thread(new Runnable() {
            @Override public void run() {
                String url = "https://f-droid.org/packages/com.termux/";
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
                    java.util.regex.Matcher m = java.util.regex.Pattern
                        .compile("\"suggestedVersionCode\"\\s*:\\s*(\\d+)")
                        .matcher(out.toString("UTF-8"));
                    if (m.find()) url = "https://f-droid.org/repo/com.termux_" + m.group(1) + ".apk";
                } catch (Exception e) { /* 保持兜底 */ }
                final String u = url;
                act.runOnUiThread(new Runnable() {
                    @Override public void run() {
                        try {
                            act.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
                        } catch (Exception e2) {
                            Toast.makeText(act, act.getString(R.string.toast_dl_fail), Toast.LENGTH_SHORT).show();
                        }
                    }
                });
            }
        }).start();
    }

    // App 内更新: 下载 APK 到应用专属目录(无需存储权限) → content:// 拉起安装管理器
    // 逻辑: 后台下载 → REQUEST_INSTALL_PACKAGES 授权检查 → ApkProvider 暴露 → ACTION_VIEW 安装
    @JavascriptInterface
    public void updateApp(final String url) {
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    final java.io.File dir = act.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) {
                        act.runOnUiThread(new Runnable() {
                            @Override public void run() {
                                Toast.makeText(act, "无法获取下载目录", Toast.LENGTH_SHORT).show();
                            }
                        });
                        return;
                    }
                    if (!dir.exists()) dir.mkdirs();
                    final java.io.File apk = new java.io.File(dir, "dsh-mobile.apk");
                    // 下载
                    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(15000);
                    conn.setInstanceFollowRedirects(true);
                    InputStream in = conn.getInputStream();
                    java.io.FileOutputStream fos = new java.io.FileOutputStream(apk);
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
                    fos.close();
                    in.close();
                    conn.disconnect();
                    // Android 8+ 安装来源授权检查
                    if (android.os.Build.VERSION.SDK_INT >= 26
                            && !act.getPackageManager().canRequestPackageInstalls()) {
                        act.runOnUiThread(new Runnable() {
                            @Override public void run() {
                                try {
                                    Intent it = new Intent(
                                        android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                        Uri.parse("package:" + act.getPackageName()));
                                    it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                    act.startActivity(it);
                                    Toast.makeText(act, "请允许安装未知应用，再点击一次更新", Toast.LENGTH_LONG).show();
                                } catch (Exception e) {
                                    Toast.makeText(act, "无法打开安装设置", Toast.LENGTH_SHORT).show();
                                }
                            }
                        });
                        return;
                    }
                    // content:// URI 拉起安装管理器
                    final Uri uri = Uri.parse("content://com.dsh.mobile.files/apk");
                    act.runOnUiThread(new Runnable() {
                        @Override public void run() {
                            try {
                                Intent it = new Intent(Intent.ACTION_VIEW);
                                it.setDataAndType(uri, "application/vnd.android.package-archive");
                                it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                act.startActivity(it);
                            } catch (Exception e) {
                                Toast.makeText(act, "无法拉起安装管理器", Toast.LENGTH_SHORT).show();
                            }
                        }
                    });
                } catch (Exception e) {
                    final String err = e.getMessage() == null ? "下载失败" : e.getMessage();
                    act.runOnUiThread(new Runnable() {
                        @Override public void run() {
                            Toast.makeText(act, err, Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            }
        }).start();
    }

    // 复制: Toast 气泡显示全文(页面同时就地"已复制 ✓")
    @JavascriptInterface
    public boolean copyText(String text) {
        try {
            final String t = text == null ? "" : text;
            ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("dshm", t));
            act.runOnUiThread(new Runnable() {
                @Override public void run() {
                    Toast.makeText(act, t, Toast.LENGTH_LONG).show();
                }
            });
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // 长按: 拉起 Termux 执行白名单命令(执行文本可带存活修饰, 显示文本不受影响)
    @JavascriptInterface
    public void runInTermux(String id) {
        final String cmd = launchTextOf(id);
        if (cmd == null) return;
        final int action = sessionActionOf(id);
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    if (!ensureTermuxRunCommandPermission()) return;
                    act.startService(termuxRunCommand(new String[]{"-c", cmd}, action));
                } catch (Exception e) {
                    Toast.makeText(act, act.getString(R.string.toast_launch_fail), Toast.LENGTH_LONG).show();
                }
            }
        });
    }



    // Termux RUN_COMMAND 解析(加固版):
    // ① queryIntentServices 按 action 找全部响应者(改名 fork 也兼容), 优先官方 com.termux;
    // ② 无响应者时回退官方显式意图。
    // ⚠ Android 11+ 包可见性: 已在 manifest 声明 <queries>, 否则这里恒空。
    private Intent termuxRunCommand(String[] args, int sessionAction) {
        String pkg = null, cls = null;
        try {
            java.util.List<android.content.pm.ResolveInfo> svcs =
                act.getPackageManager().queryIntentServices(new Intent("com.termux.RUN_COMMAND"), 0);
            for (android.content.pm.ResolveInfo r : svcs) {
                if (r.serviceInfo == null) continue;
                if (pkg == null || "com.termux".equals(r.serviceInfo.packageName)) {
                    pkg = r.serviceInfo.packageName;
                    cls = r.serviceInfo.name;
                    if ("com.termux".equals(pkg)) break;
                }
            }
        } catch (Exception e) { /* 走兜底 */ }
        Intent i = new Intent("com.termux.RUN_COMMAND");
        i.putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash");
        i.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", args);
        i.putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home");
        // 会话动作: 0=切到新会话(前台看进度) 1=留在当前应用(服务守护化, 不闪 Termux)
        if (sessionAction >= 0) {
            i.putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", String.valueOf(sessionAction));
        }
        if (pkg != null) i.setClassName(pkg, cls);
        else i.setClassName("com.termux", "com.termux.app.RunCommandService");
        return i;
    }

    private boolean ensureTermuxRunCommandPermission() {
        // Android 5(<API 23) 无运行时权限: checkSelfPermission/requestPermissions 是 API 23+ 方法,
        // 直接调用会 NoSuchMethodError; 低版本权限安装时已授予, 直接放行
        if (Build.VERSION.SDK_INT < 23) return true;
        if (act.checkSelfPermission("com.termux.permission.RUN_COMMAND")
                == PackageManager.PERMISSION_GRANTED) {
            return true;
        }
        act.requestPermissions(new String[]{"com.termux.permission.RUN_COMMAND"}, 1002);
        return false;
    }
}
