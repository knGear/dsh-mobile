package com.dshm;

import android.content.SharedPreferences;

/**
 * 冷启动目标(最近一次验证成功的连接)。
 *
 * 哲学: 冷启动是唯一连接引擎, 导向"最近验证过的实例"(不再是死板的本机 3080):
 *  - 验证成功 = onPageFinished(真实页面加载出来), 只有 dsh 真活着才算数
 *  - 引导页连接非本机实例验证成功 → 记为目标; 之后冷启动直连它
 *  - 目标失联(探测断) → 落地页, 目标不抹除(服务可能只是暂时挂了)
 */
final class PendingConnection {

    private static final String KEY = "target";

    private PendingConnection() {}

    static void set(SharedPreferences sp, String url) {
        sp.edit().putString(KEY, url).apply();
    }

    static String get(SharedPreferences sp) {
        return sp.getString(KEY, "http://127.0.0.1:3080/");
    }
}
