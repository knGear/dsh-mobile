# dshm-ui 插件使用规则（Agent 必读）

## 职责边界

**dshm-ui 只做移动 UI 适配，没有任何 restart / reload / 任务监视能力。**

- 移动设置面板（设置 → 移动设置）
- 移动版目录选择器（/sdcard 起步, 可新建/返回上一层/主页快捷）
- 界面适配 CSS（设置侧栏宽度、正文空位等, data-slot 语义锚点）
- 版本检查（dsh/dshm 当前 vs 远程最新）
- 禁用 session log（经 loader 运行时热切换插件）

**严禁在本插件里加任何 restart / reload 逻辑** —— 调用不准确会杀掉 dsh 进程。
重启/重载是 task 插件（dsh-agenttask，独立仓库）的职责。

## 端点

| 端点 | 用途 |
|---|---|
| `GET /api/dsh-open-original` | 拉起系统浏览器打开原版 UI（?plain=1, 无注入） |
| `GET /api/dshm-versions` | 当前 dsh 版本（读本地 package.json） |
| `GET /api/dshm-list-dir?path=` | 目录列表（移动版工作区选择器用） |
| `GET /api/dshm-mkdir?path=&name=` | 新建目录 |
| `GET /api/dshm-sessionlog` | 查 session log 插件是否禁用 |
| `POST /api/dshm-sessionlog?on=0|1` | 运行时热切换禁用/启用 session log（loader 热更新, 不重启） |

> `location.reload()` 只是前端页面刷新（改设置后重载 UI），**不是** dsh 服务重启，安全。

## 激活条件

- dshm 壳内（UA 含 `DSHM/`）→ 全部激活
- 网页 `/m` 路径 → 移动适配激活（浏览器加 /m 进移动版）
- UA 只限制"引导页"按钮入口（APK 专属, 浏览器无 dshm:// handler）

## 其他

- 目录选择器：`dshm.dirflow=1` 时让位给 dsh 自带原始版。
- 纯净模式 `dshm.pure=1` 禁用全部移动适配（含 CSS 注入）, 只有纯净开关能切回（线框左上角）。
- session log 开关状态与插件实际状态同步: 检测到插件开启 → 开关自动取消勾选。
