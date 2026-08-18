package com.dshm;

import android.webkit.JavascriptInterface;

/** 引导页 JS 桥: 全量动作复用 ShellBridge, 仅加 close(✕ 销毁) */
class GuideShell extends ShellBridge {

    private final GuideActivity guide;

    GuideShell(GuideActivity a, Connector c) {
        super(a, c);
        guide = a;
    }

    @JavascriptInterface
    public void close() {
        guide.runOnUiThread(new Runnable() {
            @Override public void run() { guide.dismiss(); }
        });
    }
}
