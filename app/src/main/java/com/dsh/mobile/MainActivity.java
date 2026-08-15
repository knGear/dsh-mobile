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
import android.provider.Settings;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * DSH Web 浏览器壳
 * 目标: http://127.0.0.1:3080 (dsh web)
 * 特性: 状态栏可见(深色一体化) + 安全区适配 + 离线自动重试
 */
public class MainActivity extends Activity {

    private static final String HOME_URL = "http://127.0.0.1:3080/";

    private static final String OFFLINE_HTML_ZH =
        "<html><head><meta charset='utf-8'>" +
        "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
        "</head>" +
        "<body style='margin:0;background:#151517;color:#e6e6ef;font-family:sans-serif;" +
        "display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center'>" +
        "<div style='max-width:420px;width:calc(100vw - 48px)'>" +
        "<div style='font-size:64px'>&#128011;</div>" +
        "<h2 style='margin:16px 0 8px;font-weight:600'>__TITLE__</h2>" +
        // ── 正文 ──
        // 1) 引导安装: 第一行=下载(Termux)并部署于; 第二行=两个部署按钮(点击=复制, 长按=执行)
        "<div style='margin:0 0 6px;-webkit-touch-callout:none'>" +
        "<div style='font-size:13px;color:#c8c8d8;line-height:2.2'>下载 " +
        "<button onclick=\"AndroidShell.openTermuxDownload()\" " +
        "style='padding:1px 10px;border-radius:6px;border:1px solid #6b8aff;background:transparent;color:#6b8aff;text-decoration:underline;font-size:13px;line-height:1.9'>Termux</button> 并部署于</div>" +
        "</div>" +
        "<div style='margin:0 0 12px;padding-left:20px;-webkit-touch-callout:none'>" +
        "<div style='font-size:13px;line-height:2.2'>" +
        "<button id='inst-termux' " +
        "style='padding:4px 10px;border-radius:6px;border:1px solid #4dd0e1;background:transparent;color:#4dd0e1;font-size:13px;font-weight:600;-webkit-user-select:none;user-select:none;'>Termux（性能）</button> 或 " +
        "<button id='inst-linux' " +
        "style='padding:4px 10px;border-radius:6px;border:1px solid #4dd0e1;background:transparent;color:#4dd0e1;font-size:13px;font-weight:600;-webkit-user-select:none;user-select:none;'>Termux-Ubuntu（兼容）</button>" +
        "</div></div>" +
        // 3) 已安装? 在 termux 运行 (dsh-web) 即可连接
        "<div style='margin:0 0 12px;-webkit-touch-callout:none'>" +
        "<div style='font-size:13px;color:#8a8a99;line-height:2.2'>已安装？在 termux 运行 " +
        "<button onclick=\"AndroidShell.launchTermuxStart()\" " +
        "style='padding:1px 10px;border-radius:6px;border:1px solid #4dd0e1;background:transparent;color:#4dd0e1;font-size:13px;line-height:1.9;font-weight:600'>dsh-web</button> 即可连接</div>" +
        "</div>" +
        // 4) 输入框: 空=本地默认 127.0.0.1:3080, 纯 IP 自动补 :3080(doConnect 处理)
        "<div style='display:flex;gap:8px;margin-bottom:10px'>" +
        "<input id='host' placeholder='127.0.0.1:3080' " +
        "style='flex:1;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid #3a3a4a;" +
        "background:#16161f;color:#e6e6ef;font-size:14px;outline:none'>" +
        "<button onclick=\"doConnect()\" " +
        "style='padding:10px 18px;border-radius:8px;border:none;background:#3d6be0;color:#ffffff;font-size:14px;font-weight:600'>连接</button>" +
        "</div>" +
        // 5) 历史连接 chips(输入框下; 本机条目只显端口): 上限 5
        "<div id='hist' style='display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;width:100%;box-sizing:border-box'></div>" +
        // 6) 遇到困难? + 四档修复(常显, __FIX_ROW__ 由 offlineHtml() 替换)
        "<div style='text-align:left;margin:0 0 12px'>" +
        "<div style='font-size:13px;color:#c8c8d8;margin-bottom:8px'>遇到困难？</div>" +
        "__FIX_ROW__" +
        "</div>" +
        // 7) 两个仓库(纯点击链接)
        "<div style='display:flex;gap:8px;margin:0 0 18px;justify-content:center;flex-wrap:wrap'>" +
        "<button onclick=\"AndroidShell.openUrl('https://github.com/knGear/dsh-mobile')\" " +
        "style='padding:8px 16px;border-radius:8px;border:1px solid #6b8aff;background:transparent;color:#6b8aff;text-decoration:underline;font-size:13px'>dsh-mobile 仓库</button>" +
        "<button onclick=\"AndroidShell.openUrl('https://github.com/deepseek-ai/dsh')\" " +
        "style='padding:8px 16px;border-radius:8px;border:1px solid #6b8aff;background:transparent;color:#6b8aff;text-decoration:underline;font-size:13px'>dsh 仓库</button>" +
        // 2) 通知引导: (开启通知) 获取增强体验 — 已授权: 按钮灰 + 文末 ✓
        "<div style='margin:0 0 12px;-webkit-touch-callout:none'>" +
        "<div style='font-size:13px;color:#c8c8d8;line-height:2.2'>" +
        "<button id='dsh-notify-btn' onclick=\"AndroidShell.requestNotifyPermission()\" " +
        "style='padding:1px 10px;border-radius:6px;border:1px solid #3a3a4a;background:transparent;color:#c8c8d8;font-size:13px;line-height:1.9'>开启通知</button> 获取增强体验（可选）" +
        "<span id='dsh-notify-ok' style='display:none;color:#6a6a78;margin-left:4px'>&#10003;</span>" +
        "</div></div>" +
        // 8) 底部: 代码块(点击复制) — 启用长按一键运行
        "<div style='margin:0 0 12px;font-size:12px;color:#6a6a78;line-height:1.8'>点击复制以下命令到 Termux 运行，即可长按青色按钮一键运行</div>" +
        "<div id='dsh-copy-cmd' onclick=\"if(AndroidShell.copyTermuxCommand())showCopyOk();\" title='点击复制' " +
        "style='margin:0 0 18px;text-align:left;background:#1a1a24;border:1px solid #2a2a36;border-radius:8px;padding:10px 12px;font-size:11px;color:#8fb1ff;font-family:monospace;word-break:break-all;cursor:pointer'>" +
        "echo allow-external-apps=true &gt; ~/.termux/termux.properties &amp;&amp; termux-reload-settings" +
        "<div style='margin-top:6px;font-size:10px;color:#5a5a6a;text-align:center'>点击复制</div></div>" +
        "</div>" +
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
        "var c=document.createElement('button');" +
        "// 本机(127.0.0.1/localhost)条目只显端口, 软适配本机多部署(多实例各占一 chip)" +
        "var label=h.indexOf('127.0.0.1:')===0||h.indexOf('localhost:')===0?h.substring(h.indexOf(':')+1):h;" +
        "c.textContent=label;" +
        "c.style.cssText='padding:5px 10px;border-radius:8px;border:1px solid #3a3a4a;" +
        "background:#2a2a36;color:#c8c8d8;font-size:12px;cursor:pointer;';" +
        "c.onclick=function(){AndroidShell.connect(h);};b.appendChild(c);})(l[i]);}}" +
        "catch(e){}}" +
        "renderHist();" +
"function showCopyOk(){var d=document.getElementById(39,100,115,104,45,99,111,112,121,45,99,109,100,39);if(!d)return;var o=d.innerHTML;d.innerHTML=String.fromCharCode(60,100,105,118,32,115,116,121,108,101,61,34,116,101,120,116,45,97,108,105,103,110,58,99,101,110,116,101,114,59,99,111,108,111,114,58,35,52,99,97,102,53,48,34,62,24050,22797,21046,32,10003,60,47,100,105,118,62);setTimeout(function(){d.innerHTML=o;},1200);}" +
        "</div></body></html>";
private static final String OFFLINE_HTML_EN =
        "<html><head><meta charset='utf-8'>" +
        "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
        "</head>" +
        "<body style='margin:0;background:#151517;color:#e6e6ef;font-family:sans-serif;" +
        "display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center'>" +
        "<div style='max-width:420px;width:calc(100vw - 48px)'>" +
        "<div style='font-size:64px'>&#128011;</div>" +
        "<h2 style='margin:16px 0 8px;font-weight:600'>__TITLE__</h2>" +
        // 说明句: dsh-web/Termux 为句内按钮(点击=启动后端 / 下载Termux)
        "<p style='margin:0 0 18px;color:#8a8a99;line-height:2.2'>Run " +
        "<button onclick=\"AndroidShell.launchTermuxStart()\" " +
        "style='padding:1px 10px;border-radius:6px;border:1px solid #4dd0e1;background:transparent;color:#4dd0e1;font-size:13px;line-height:1.9;font-weight:600'>dsh-web</button> in " +
        "<button onclick=\"AndroidShell.openTermuxDownload()\" " +
        "style='padding:1px 10px;border-radius:6px;border:1px solid #6b8aff;background:transparent;color:#6b8aff;text-decoration:underline;font-size:13px;line-height:1.9'>Termux</button>, then connect</p>" +
        // 输入框: 空=本地默认 127.0.0.1:3080, 纯 IP 自动补 :3080(doConnect 处理)
        "<div style='display:flex;gap:8px;margin-bottom:10px'>" +
        "<input id='host' placeholder='127.0.0.1:3080' " +
        "style='flex:1;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid #3a3a4a;" +
        "background:#16161f;color:#e6e6ef;font-size:14px;outline:none'>" +
        "<button onclick=\"doConnect()\" " +
        "style='padding:10px 18px;border-radius:8px;border:none;background:#3d6be0;color:#ffffff;font-size:14px;font-weight:600'>Connect</button>" +
        "</div>" +
        // 远程连接记录(上限 5, 与输入框同宽)
        "<div id='hist' style='display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;width:100%;box-sizing:border-box'></div>" +
        // ── Body ──
        // 1) Install guide: line1=Download (Termux) and deploy on; line2=two deploy buttons
        "<div style='margin:0 0 6px;-webkit-touch-callout:none'>" +
        "<div style='font-size:13px;color:#c8c8d8;line-height:2.2'>Download " +
        "<button onclick=\"AndroidShell.openTermuxDownload()\" " +
        "style='padding:1px 10px;border-radius:6px;border:1px solid #6b8aff;background:transparent;color:#6b8aff;text-decoration:underline;font-size:13px;line-height:1.9'>Termux</button> and deploy on</div>" +
        "</div>" +
        "<div style='margin:0 0 12px;padding-left:20px;-webkit-touch-callout:none'>" +
        "<div style='font-size:13px;line-height:2.2'>" +
        "<button id='inst-termux' " +
        "style='padding:4px 10px;border-radius:6px;border:1px solid #4dd0e1;background:transparent;color:#4dd0e1;font-size:13px;font-weight:600;-webkit-user-select:none;user-select:none;'>Termux（Perf）</button> or " +
        "<button id='inst-linux' " +
        "style='padding:4px 10px;border-radius:6px;border:1px solid #4dd0e1;background:transparent;color:#4dd0e1;font-size:13px;font-weight:600;-webkit-user-select:none;user-select:none;'>Termux-Ubuntu（Compat）</button>" +
        "</div></div>" +
        // 3) Already installed? Run (dsh-web) in termux to connect
        "<div style='margin:0 0 12px;-webkit-touch-callout:none'>" +
        "<div style='font-size:13px;color:#8a8a99;line-height:2.2'>Already installed? Run " +
        "<button onclick=\"AndroidShell.launchTermuxStart()\" " +
        "style='padding:1px 10px;border-radius:6px;border:1px solid #4dd0e1;background:transparent;color:#4dd0e1;font-size:13px;line-height:1.9;font-weight:600'>dsh-web</button> in termux to connect</div>" +
        "</div>" +
        // 4) Input: empty=127.0.0.1:3080, bare IP auto-appends :3080
        "<div style='display:flex;gap:8px;margin-bottom:10px'>" +
        "<input id='host' placeholder='127.0.0.1:3080' " +
        "style='flex:1;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid #3a3a4a;" +
        "background:#16161f;color:#e6e6ef;font-size:14px;outline:none'>" +
        "<button onclick=\"doConnect()\" " +
        "style='padding:10px 18px;border-radius:8px;border:none;background:#3d6be0;color:#ffffff;font-size:14px;font-weight:600'>Connect</button>" +
        "</div>" +
        // 5) History chips (under input; local entries show port only): max 5
        "<div id='hist' style='display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;width:100%;box-sizing:border-box'></div>" +
        // 6) Troubleshooting + 4 fix buttons (always shown)
        "<div style='text-align:left;margin:0 0 12px'>" +
        "<div style='font-size:13px;color:#c8c8d8;margin-bottom:8px'>Troubleshooting?</div>" +
        "__FIX_ROW__" +
        "</div>" +
        // 7) Two repos (links)
        "<div style='display:flex;gap:8px;margin:0 0 18px;justify-content:center;flex-wrap:wrap'>" +
        "<button onclick=\"AndroidShell.openUrl('https://github.com/knGear/dsh-mobile')\" " +
        "style='padding:8px 16px;border-radius:8px;border:1px solid #6b8aff;background:transparent;color:#6b8aff;text-decoration:underline;font-size:13px'>dsh-mobile repo</button>" +
        "<button onclick=\"AndroidShell.openUrl('https://github.com/deepseek-ai/dsh')\" " +
        "style='padding:8px 16px;border-radius:8px;border:1px solid #6b8aff;background:transparent;color:#6b8aff;text-decoration:underline;font-size:13px'>dsh repo</button>" +
        // 2) Notify guide: (Enable notifications) for enhanced experience — granted: gray + ✓
        "<div style='margin:0 0 12px;-webkit-touch-callout:none'>" +
        "<div style='font-size:13px;color:#c8c8d8;line-height:2.2'>" +
        "<button id='dsh-notify-btn' onclick=\"AndroidShell.requestNotifyPermission()\" " +
        "style='padding:1px 10px;border-radius:6px;border:1px solid #3a3a4a;background:transparent;color:#c8c8d8;font-size:13px;line-height:1.9'>Enable notifications</button> for enhanced experience (optional)" +
        "<span id='dsh-notify-ok' style='display:none;color:#6a6a78;margin-left:4px'>&#10003;</span>" +
        "</div></div>" +
        // 8) Bottom: code block (click to copy) — enable long-press one-click run
        "<div style='margin:0 0 12px;font-size:12px;color:#6a6a78;line-height:1.8'>Tap to copy the command below to Termux to enable long-press one-click run</div>" +
        "<div id='dsh-copy-cmd' onclick=\"if(AndroidShell.copyTermuxCommand())showCopyOk();\" title='Tap to copy' " +
        "style='margin:0 0 18px;text-align:left;background:#1a1a24;border:1px solid #2a2a36;border-radius:8px;padding:10px 12px;font-size:11px;color:#8fb1ff;font-family:monospace;word-break:break-all;cursor:pointer'>" +
        "echo allow-external-apps=true &gt; ~/.termux/termux.properties &amp;&amp; termux-reload-settings" +
        "<div style='margin-top:6px;font-size:10px;color:#5a5a6a;text-align:center'>Tap to copy</div></div>" +
        "</div>" +
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
        "var c=document.createElement('button');" +
        "// 本机(127.0.0.1/localhost)条目只显端口, 软适配本机多部署(多实例各占一 chip)" +
        "var label=h.indexOf('127.0.0.1:')===0||h.indexOf('localhost:')===0?h.substring(h.indexOf(':')+1):h;" +
        "c.textContent=label;" +
        "c.style.cssText='padding:5px 10px;border-radius:8px;border:1px solid #3a3a4a;" +
        "background:#2a2a36;color:#c8c8d8;font-size:12px;cursor:pointer;';" +
        "c.onclick=function(){AndroidShell.connect(h);};b.appendChild(c);})(l[i]);}}" +
        "catch(e){}}" +
        "renderHist();" +
"function showCopyOk(){var d=document.getElementById(39,100,115,104,45,99,111,112,121,45,99,109,100,39);if(!d)return;var o=d.innerHTML;d.innerHTML=String.fromCharCode(60,100,105,118,32,115,116,121,108,101,61,34,116,101,120,116,45,97,108,105,103,110,58,99,101,110,116,101,114,59,99,111,108,111,114,58,35,52,99,97,102,53,48,34,62,24050,22797,21046,32,10003,60,47,100,105,118,62);setTimeout(function(){d.innerHTML=o;},1200);}" +
        "</div></body></html>";

    // 离线页按系统语言选择 + "使用过"标记决定是否显示"修复"四档行
    // 四档自救阶梯(左→右严重度递增): 浏览器原版/原版修复/简易重装/清洁重装
    // 点击=复制对应命令/地址, 长按/右键=一键执行(浏览器原版=打开浏览器, 其余拉起 Termux)
    private static String offlineHtml(boolean used, boolean hasNotifyPerm, String localKind) {
        boolean en = java.util.Locale.getDefault().getLanguage().startsWith("en");
        String html = en ? OFFLINE_HTML_EN : OFFLINE_HTML_ZH;
        // 标题按本机实例状态生成(只对本地负责): none=未运行 / termux / termux-linux
        String title;
        if ("init".equals(localKind)) title = en ? "New here?" : "初来乍到？";
        else if ("termux".equals(localKind)) title = en ? "Local dsh running on Termux" : "本机 dsh 已运行于 Termux";
        else if (localKind != null && localKind.startsWith("termux-linux"))
            title = en ? "Local dsh running on Termux-Linux" : "本机 dsh 已运行于 Termux-Linux";
        else title = en ? "Local dsh not running" : "本机 dsh 未运行";
        html = html.replace("__TITLE__", title);
        // 通知权限已授予 → 按钮变灰 + 显示文末 ✓(引导第二行, 不再隐藏)
        if (hasNotifyPerm) {
            html = html.replace(
                "id='dsh-notify-btn' onclick=\"AndroidShell.requestNotifyPermission()\" ",
                "id='dsh-notify-btn' disabled style='padding:1px 10px;border-radius:6px;border:1px solid #3a3a4a;background:transparent;color:#6a6a78;font-size:13px;line-height:1.9' ");
            html = html.replace(
                "<span id='dsh-notify-ok' style='display:none;color:#4caf50;margin-left:4px'>&#10003;</span>",
                "<span id='dsh-notify-ok' style='color:#4caf50;margin-left:4px'>&#10003;</span>");
        }
        String fixRow = "<div style='display:flex;gap:6px;margin:0 0 12px;-webkit-touch-callout:none'>" +
            "<button id='fx-browser' " +
            "style='flex:1;padding:8px 2px;border-radius:8px;border:1px solid #4dd0e1;background:transparent;color:#4dd0e1;font-size:12px;font-weight:600;-webkit-user-select:none;user-select:none;'>" +
            (en ? "Browser" : "浏览器原版") + "</button>" +
            "<button id='fx-repair' " +
            "style='flex:1;padding:8px 2px;border-radius:8px;border:1px solid #4dd0e1;background:transparent;color:#4dd0e1;font-size:12px;font-weight:600;-webkit-user-select:none;user-select:none;'>" +
            (en ? "Repair" : "原版修复") + "</button>" +
            "<button id='fx-simple' " +
            "style='flex:1;padding:8px 2px;border-radius:8px;border:1px solid #4dd0e1;background:transparent;color:#4dd0e1;font-size:12px;font-weight:600;-webkit-user-select:none;user-select:none;'>" +
            (en ? "Reinstall" : "简易重装") + "</button>" +
            // 危险动作(清洁重装): 红字 + 下划线强调
            "<button id='fx-clean' " +
            "style='flex:1;padding:8px 2px;border-radius:8px;border:1px solid #d95252;background:transparent;color:#ff8a8a;font-size:12px;font-weight:700;text-decoration:underline;-webkit-user-select:none;user-select:none;'>" +
            (en ? "Clean" : "清洁重装") + "</button>" +
            "</div>";
        return html.replace("__FIX_ROW__", fixRow);
    }

    // 是否成功使用过 dsh(离线页据此显示"修复 dsh"按钮)
    private boolean usedBefore() {
        return getSharedPreferences("dsh_shell", MODE_PRIVATE).getBoolean("used_before", false);
    }

    private WebView webView;
    private View container;
    private boolean offline = false;
    private boolean previewInit = false; // 初始页预览(debug 入口): 强制"初次使用?"视角
    private boolean offlinePending = false; // 15s 宽限探测中
    // 全面屏(edge-to-edge)开关 + 上下安全区偏移(dp, -10~10, 0=系统原生 insets)
    private boolean edgeToEdge = true;
    private int insetTopOffset = 0;
    private int insetBottomOffset = 0;
    // 手动进入初始页模式: 不自动探测回跳(等用户操作退出)
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
                    injectSidebarHook(view);
                    // 成功加载过真实页面 → 记"使用过"(离线页"修复 dsh"按钮的依据; 离线页加载时 offline=true 不算)
                    if (!offline) {
                        getSharedPreferences("dsh_shell", MODE_PRIVATE)
                            .edit().putBoolean("used_before", true).apply();
                    }
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
                            Toast.makeText(getApplicationContext(), getString(R.string.toast_ip_port), Toast.LENGTH_SHORT).show();
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
                        previewInit = false;
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
                            Toast.makeText(getApplicationContext(), getString(R.string.toast_open_fail), Toast.LENGTH_SHORT).show();
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
                                    Toast.makeText(getApplicationContext(), getString(R.string.toast_dl_fail), Toast.LENGTH_SHORT).show();
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
                        Toast.makeText(getApplicationContext(), getString(R.string.toast_copied), Toast.LENGTH_SHORT).show();
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

            // 手动进入初始页(设置里"进入初始页"按钮): 显示 DSH 未启动页,
            // 可远程连接 IP:端口 或复制一键安装脚本。手动模式不自动探测回跳,
            // 由用户点"本机重试"(走 connect)或输入远程地址退出。
            // ⚠ 修复: 每次点击强制复位 offline(否则返回键回主页后 offline 残留 true, 第二次点击被 showOffline 的 if(offline)return 吞掉)
            @JavascriptInterface
            public void showOfflinePage(String mode) {
                final boolean init = "init".equals(mode);
                previewInit = init; // 初始页预览: 强制"初次使用?"视角(隐藏四档/故障区)
                manualOffline = true;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        offline = false;
                        showOffline();
                    }
                });
            }

            // 通知权限状态: "1"=已获得(或 Android 8-12 无需), "0"=未获得(离线页按钮显隐依据)
            @JavascriptInterface
            public String hasNotifyPermission() {
                try {
                    if (Build.VERSION.SDK_INT >= 33) {
                        return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                            == PackageManager.PERMISSION_GRANTED ? "1" : "0";
                    }
                    return "1";
                } catch (Exception e) { return "0"; }
            }

            // 开启通知(系统设置: 通知权限页; 离线页按钮, 有权限自动隐藏)
            @JavascriptInterface
            public void requestNotifyPermission() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                            i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                            startActivity(i);
                        } catch (Exception e) {
                            Toast.makeText(getApplicationContext(), "无法打开通知设置", Toast.LENGTH_SHORT).show();
                        }
                    }
                });
            }

            // 四档自救阶梯(离线页): browser=浏览器原版, repair=原版修复(dsh-reinstall.sh 无损),
            // simple=简易重装(dsh-install-termux.sh), clean=清洁重装(dsh-repair.sh)
            // 长按/右键=fixRun 一键执行(浏览器原版=系统浏览器打开, 其余拉起 Termux);
            // 点击=fixCopy 复制对应命令/地址。
            // 引导页底部代码块: 复制"开启 Termux 外部应用执行"配置命令(点击复制, 返回 true 供页面显示反馈)
            @JavascriptInterface
            public boolean copyTermuxCommand() {
                try {
                    final String cmd = "echo allow-external-apps=true > ~/.termux/termux.properties && termux-reload-settings";
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(ClipData.newPlainText("dsh termux config", cmd));
                    return true;
                } catch (Exception e) { return false; }
            }

            @JavascriptInterface
            public void fixRun(String which) {
                final String w = which == null ? "" : which.trim();
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            if (w.equals("browser")) {
                                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("http://127.0.0.1:3080/")));
                                return;
                            }
                            if (!w.equals("repair") && !w.equals("simple") && !w.equals("clean")) return;
                            if (!ensureTermuxRunCommandPermission()) return;
                            startService(termuxRunCommand(new String[]{
                                "-c", fixCommand(w)
                            }));
                        } catch (Exception e) {
                            Toast.makeText(getApplicationContext(),
                                getString(R.string.toast_launch_fail), Toast.LENGTH_LONG).show();
                        }
                    }
                });
            }

            @JavascriptInterface
            public void fixCopy(String which) {
                final String w = which == null ? "" : which.trim();
                if (!w.equals("browser") && !w.equals("repair") && !w.equals("simple") && !w.equals("clean")) return;
                final String text = w.equals("browser") ? "http://127.0.0.1:3080" : fixCommand(w);
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("dsh fix command", text));
                final int res = w.equals("browser") ? R.string.toast_fix_copied_browser
                    : w.equals("repair") ? R.string.toast_fix_copied_repair
                    : w.equals("simple") ? R.string.toast_fix_copied_simple
                    : R.string.toast_fix_copied_clean;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(getApplicationContext(), getString(res), Toast.LENGTH_SHORT).show();
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
                            Toast.makeText(getApplicationContext(), getString(R.string.toast_launch_fail), Toast.LENGTH_LONG).show();
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
                                getString(R.string.toast_launch_fail), Toast.LENGTH_LONG).show();
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
                                getString(R.string.toast_copied), Toast.LENGTH_SHORT).show();
                        }
                    });
                } catch (Exception e) {
                    final String msg = e.getMessage();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(getApplicationContext(), getString(R.string.toast_copy_fail, msg), Toast.LENGTH_SHORT).show();
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

    // 四档自救阶梯对应的 Termux 命令(与复制内容一致, 白名单)
    private static String fixCommand(String which) {
        final String base = "https://raw.githubusercontent.com/knGear/dsh-mobile/main/scripts/";
        final String script;
        if (which.equals("repair")) script = "dsh-reinstall.sh";
        else if (which.equals("simple")) script = "dsh-install-termux.sh";
        else if (which.equals("clean")) script = "dsh-repair.sh";
        else return "";
        return "curl -fsSL " + base + script + " -o $HOME/" + script + " && bash $HOME/" + script;
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
        // 返回键退出离线页时复位状态(否则 showOfflinePage 二次点击被 if(offline)return 吞掉)
        if (offline) {
            offline = false;
            manualOffline = false;
        }
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

    // ── 侧栏状态检测钩子(壳层注入, 不依赖 dsh 插件系统) ───────────
    // ⚠ 只做检测: 同步 body[data-dsh-sidebar]=open|closed + 宽度 CSS 变量(--dsh-shell-sidebar-w/--dsh-shell-details-w)
    //   + frame 标记类 .dsh-shell-frame; UI(抽屉化/遮罩)由 mobile-ui 插件消费这些状态实现, 改 UI 不用重新构建 APK
    // 检测原理: frame 展开时无 data-sidebar-collapsed 属性(React 管理), 用 handle 或属性定位 frame
    private void injectSidebarHook(WebView view) {
        String js =
            "(function(){try{" +
            "if(document.getElementById('dsh-shell-hook'))return;" +
            "var m=document.createElement('div');m.id='dsh-shell-hook';m.style.display='none';document.body.appendChild(m);" +
            "function findFrame(){var h=document.querySelector('[data-side=\"sidebar\"],[data-side=\"details\"]');if(h&&h.parentElement)return h.parentElement;return document.querySelector('[data-sidebar-collapsed],[data-details-collapsed]')||null}" +
            "function sync(){" +
            "var frame=findFrame();" +
            "var open=!!frame&&!frame.hasAttribute('data-sidebar-collapsed');" +
            "document.body.setAttribute('data-dsh-sidebar',open?'open':'closed');" +
            "if(frame){" +
            "frame.classList.add('dsh-shell-frame');" +
            "var t=(frame.style.gridTemplateColumns||'').split(' ').filter(Boolean);" +
            "var sw=parseFloat(t[0])||240;var dw=t.length>=3?(parseFloat(t[t.length-1])||0):0;" +
            "document.body.style.setProperty('--dsh-shell-sidebar-w',sw+'px');" +
            "document.body.style.setProperty('--dsh-shell-details-w',dw+'px');" +
            "}" +
            "}" +
            "sync();" +
            "var mo=new MutationObserver(sync);mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','data-sidebar-collapsed','data-details-collapsed']});" +
            "setInterval(sync,1200);" +
            "window.addEventListener('resize',sync);" +
            "}catch(e){}})()";
        view.evaluateJavascript(js, null);
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

    // 冷启动渲染层权限检查(供 offlineHtml 决定是否显示"开启通知"按钮; 与 JS bridge 同逻辑)
    private boolean notifyPermGranted() {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
            }
            return true;
        } catch (Exception e) { return false; }
    }

    // 离线页渲染(每次渲染: 本机实例状态标题 + 按当前权限决定"开启通知"按钮显隐)
    private void renderOffline() {
        boolean init = previewInit;
        // 初始页预览(debug): 强制"初次使用?"视角 — 无四档/故障区, 标题固定
        webView.loadDataWithBaseURL(HOME_URL,
            offlineHtml(init ? false : usedBefore(), notifyPermGranted(),
                init ? "init" : detectLocalInstance()),
            "text/html", "UTF-8", null);
    }

    // 本机实例状态: 以插件心跳为准(插件每 15s 广播 heartbeat, NotifyReceiver 记录静态字段)。
    // 心跳 30s 内收到 → 已运行(instance=termux 或 termux-linux:debian); 过期/无 → none(未运行)
    // 兜底: 无任何心跳记录时读安装脚本写的 /etc/dsh-instance.conf(仅环境类型, 不代表运行)
    private String detectLocalInstance() {
        try {
            long last = NotifyReceiver.lastHeartbeat;
            String inst = NotifyReceiver.heartbeatInstance;
            if (last > 0 && System.currentTimeMillis() - last < 30000 && inst != null && !inst.isEmpty()) {
                return inst;
            }
            if (last > 0 && System.currentTimeMillis() - last >= 30000) {
                return "none"; // 心跳过期: dsh 已不在运行
            }
            // 从未收到心跳: 读安装脚本配置兜底(termux / termux-linux[:distro])
            SharedPreferences sp = getSharedPreferences("dsh_shell", MODE_PRIVATE);
            String cached = sp.getString("local_instance", "");
            if (!cached.isEmpty()) return cached;
            String val = "none";
            try {
                java.io.File f = new java.io.File(
                    "/data/data/com.termux/files/usr/etc/dsh-instance.conf");
                if (f.canRead() && f.length() < 256) {
                    java.io.FileInputStream in = new java.io.FileInputStream(f);
                    byte[] b = new byte[256];
                    int n = in.read(b);
                    in.close();
                    String line = new String(b, 0, Math.max(n, 0), "UTF-8").trim();
                    if (line.startsWith("instance=")) {
                        val = line.substring("instance=".length()).trim();
                        if (val.isEmpty()) val = "none";
                    }
                }
            } catch (Exception e) { /* 忽略 */ }
            sp.edit().putString("local_instance", val).apply();
            return val;
        } catch (Exception e) { return "none"; }
    }

    private void showOffline() {
        if (offline) return;
        offline = true;
        renderOffline();
        handler.postDelayed(retryProbe, 3000);
    }

    // 切回前台(授权设置返回/其它 App 切回): 离线页重渲染, 让"开启通知"按最新权限显隐
    @Override
    protected void onResume() {
        super.onResume();
        try {
            if (offline && webView != null) renderOffline();
        } catch (Exception e) { /* 忽略 */ }
    }

    private final Runnable retryProbe = new Runnable() {
        @Override
        public void run() {
            if (!offline || manualOffline) return; // 手动进入初始页: 不自动回跳
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
