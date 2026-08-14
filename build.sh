#!/bin/bash
# DSH Web 壳 APK 构建 —— 在 proot Debian 中运行
# 混合构建: aapt(资源) + javac + d8 + apksigner (box64 无 AAPT2 时的标准流程)
set -e
SRC=/sdcard/1tui/apk/dsh/app/src/main
BUILD=/root/dsh-build
SDK=/root/android-sdk
JAR=$SDK/platforms/android-34/android.jar
D8=$SDK/cmdline-tools/cmdline-tools/bin/d8
# release keystore(随仓库提交, 稳定签名; 密码 dshmobile123 / alias dshmobile)
KS=/sdcard/1tui/apk/dsh/release.keystore
OUT=/sdcard/1tui/apk/dsh/out

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$OUT"
cd "$BUILD"

echo "== 1/5 aapt 资源打包 =="
/root/aapt package -f \
  -M "$SRC/AndroidManifest.xml" -S "$SRC/res" \
  -J gen -I "$JAR" -F base.unsigned.apk

echo "== 2/5 javac 编译 =="
javac -source 1.8 -target 1.8 -bootclasspath "$JAR" \
  -d classes gen/R.java $(find "$SRC/java" -name "*.java")

echo "== 3/5 d8 转 dex =="
"$D8" --lib "$JAR" --min-api 26 --output . classes/com/dsh/mobile/*.class

echo "== 4/5 注入 dex + zipalign + 签名 =="
cp base.unsigned.apk app.apk
zip -j app.apk classes.dex
zipalign -f 4 app.apk app.aligned.apk
apksigner sign --ks "$KS" --ks-key-alias dshmobile --ks-pass pass:dshmobile123 --key-pass pass:dshmobile123 app.aligned.apk
mv app.aligned.apk dsh-shell.apk

echo "== 5/5 输出 =="
VER=$(grep -oP "android:versionName=\"\K[0-9.]+" "$SRC/AndroidManifest.xml")
cp dsh-shell.apk "$OUT/DSH-v$VER.apk"
echo "=> $OUT/DSH-v$VER.apk ($(stat -c%s "$OUT/DSH-v$VER.apk") bytes)"
