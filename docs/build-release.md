# 构建与发布

## 构建 APK（proot Debian 内）

```bash
cd <仓库目录>   # 在仓库根目录运行即可
bash build.sh
# 产物: out/DSH-v<versionName>.apk
```

工具链：aapt + javac(1.8) + d8 + zipalign + apksigner（Debian Trixie + android-sdk）。
构建坑：老 d8 不支持 lambda → Java 一律匿名类。

## 版本号

`app/src/main/AndroidManifest.xml`：`versionCode`（递增）+ `versionName`（语义版本）。

## 发布（GitHub Releases，双资产）

```bash
git tag v<版本> && git push origin v<版本>
```

Release 需上传**两个资产**（同名文件）：
1. `DSH-v<版本>.apk`（版本化，人类可读）
2. `dsh-mobile.apk`（**固定名**——离线页"最新版下载"依赖它：
   `https://github.com/knGear/dsh-mobile/releases/latest/download/dsh-mobile.apk`）

API 上传（token 在 `~/.github_token`）：
```bash
# 建 release 拿 id
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://api.github.com/repos/knGear/dsh-mobile/releases \
  -d '{"tag_name":"v<版本>","name":"v<版本>","body":"..."}'
# 传资产（注意 uploads.github.com + release id）
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @out/DSH-v<版本>.apk \
  "https://uploads.github.com/repos/knGear/dsh-mobile/releases/<id>/assets?name=dsh-mobile.apk"
```

## 同步流程（开发目录 ↔ 仓库）

- 插件改动：`~/.dsh/profiles/node_modules/<name>/` → `plugins/<name>/`
- 壳改动：开发目录 `app/src/main/` → 仓库 `app/src/main/`（**manifest 版本号不同步**，仓库保持发布版）
- 脚本：开发目录 `scripts/` → 仓库 `scripts/`
