package com.dsh.mobile;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.FileNotFoundException;

/**
 * 最小 FileProvider 替代(纯 aapt/javac 构建, 无 androidx 依赖):
 * 暴露 getExternalFilesDir(Download)/dsh-mobile.apk 给系统安装器(content:// URI)。
 * Android 7+ 拉起安装必须 content://, file:// 会 FileUriExposedException。
 */
public class ApkProvider extends ContentProvider {
    @Override
    public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        Context c = getContext();
        File dir = c == null ? null : c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        File apk = dir == null ? null : new File(dir, "dsh-mobile.apk");
        if (apk == null || !apk.exists()) throw new FileNotFoundException("APK 未找到");
        return ParcelFileDescriptor.open(apk, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public String getType(Uri uri) { return "application/vnd.android.package-archive"; }
    @Override public Cursor query(Uri uri, String[] p1, String p2, String[] p3, String p4) { return null; }
    @Override public String[] getStreamTypes(Uri uri, String mimeTypeFilter) { return null; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] args) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { return 0; }
}

