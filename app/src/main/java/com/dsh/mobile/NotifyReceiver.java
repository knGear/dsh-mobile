package com.dsh.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.os.Build;
import android.util.Base64;

import org.json.JSONObject;

/**
 * 通知广播接收器。
 * dsh 侧工具通过显式广播触发:
 *   am broadcast -a com.dsh.mobile.NOTIFY -n com.dsh.mobile/.NotifyReceiver --es payload <base64-json>
 * payload 为 base64(JSON), 支持字段:
 *   title / body / url  — 基础内容
 *   ongoing: true       — 常驻不可关闭通知(静默渠道 dsh_status, 需配 id)
 *   id: <int>           — 固定通知 id(更新/注销用同一 id)
 *   cancel: true        — 注销 id 对应的常驻通知(仅发 id)
 * 点击通知打开 MainActivity(带 url 跳转)。
 */
public class NotifyReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "dsh_notify_v2";
    private static final String CHANNEL_SILENT_ID = "dsh_notify_silent";
    private static final String CHANNEL_STATUS_ID = "dsh_status";
    private static final int DEFAULT_ONGOING_ID = 1000;

    @Override
    public void onReceive(Context context, Intent intent) {
        String title = "DSH";
        String body = "";
        String url = null;
        boolean ongoing = false;
        boolean cancel = false;
        int id = -1;
        String channel = null;

        try {
            String payload = intent.getStringExtra("payload");
            if (payload != null) {
                JSONObject o = new JSONObject(new String(Base64.decode(payload, Base64.DEFAULT), "UTF-8"));
                if (o.has("title") && o.optString("title").length() > 0) title = o.optString("title");
                body = o.optString("body", "");
                if (o.has("url")) url = o.optString("url");
                ongoing = o.optBoolean("ongoing", false);
                cancel = o.optBoolean("cancel", false);
                if (o.has("id")) id = o.optInt("id", -1);
                if (o.has("channel")) channel = o.optString("channel");
            } else {
                String t = intent.getStringExtra("title");
                String b = intent.getStringExtra("body");
                String u = intent.getStringExtra("url");
                if (t != null && t.length() > 0) title = t;
                if (b != null) body = b;
                url = u;
                channel = intent.getStringExtra("channel");
            }
        } catch (Exception ignored) {
        }

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannel(nm, CHANNEL_ID, "DSH 通知", NotificationManager.IMPORTANCE_HIGH, true);
        ensureChannel(nm, CHANNEL_SILENT_ID, "DSH 通知(静音)", NotificationManager.IMPORTANCE_HIGH, false);
        ensureChannel(nm, CHANNEL_STATUS_ID, "DSH 运行状态", NotificationManager.IMPORTANCE_LOW, false);
        // 清理孤儿渠道(v0.3 遗留的 dsh_notify, importance 已锁定无法复用)
        nm.deleteNotificationChannel("dsh_notify");

        // 注销常驻通知
        if (cancel) {
            nm.cancel(id >= 0 ? id : DEFAULT_ONGOING_ID);
            return;
        }

        int notifyId = id >= 0 ? id : (int) (System.currentTimeMillis() & 0x7fffffff);
        // 渠道选择: 插件显式 channel 优先(声音开关), 常驻走 status, 否则默认有声渠道
        String channelId = channel != null ? channel
            : (ongoing ? CHANNEL_STATUS_ID : CHANNEL_ID);

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (url != null) open.putExtra("url", url);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pi = PendingIntent.getActivity(context, 0, open, flags);

        Notification.Builder n = new Notification.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(pi);
        if (ongoing) {
            n.setOngoing(true).setAutoCancel(false);
        } else {
            n.setAutoCancel(true);
        }

        nm.notify(notifyId, n.build());
    }

    private static void ensureChannel(NotificationManager nm, String channelId, String name,
                                     int importance, boolean alert) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(channelId, name, importance);
            ch.setDescription("dsh 插件与 agent 触发的通知");
            if (alert) {
                ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), null);
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[]{0, 250, 250, 250});
            } else {
                ch.setSound(null, null);
                ch.enableVibration(false);
            }
            nm.createNotificationChannel(ch);
        }
    }
}
