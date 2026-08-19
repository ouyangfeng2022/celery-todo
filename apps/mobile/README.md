# @celery/mobile — Celery Todo 3.0 移动端（Expo）

Expo + React Native（New Architecture），数据层复用 `@celery/data` 的
Repository 契约（`src/data/expo-sqlite-repositories.ts`，v3 schema 与桌面端一致）。

**移动端是独立应用**：数据只存本机 SQLite，与桌面端互不相通、无任何导入关系。
首次启动自动创建「收集箱」项目，项目全程在端内新建 / 重命名 / 删除。

## 为什么不在根 workspace

本仓库根 workspace 用 Bun 管理桌面/共享包；`react-native` 的
`@react-native/debugger-frontend` 依赖树在 Windows 上超出 bun 的链接能力
（长路径 copyfile 失败），因此 `apps/mobile` 保持独立依赖，不进根安装。
本地根目录的 `bun install` 不会触碰移动端依赖。

## 常用命令

```bash
cd apps/mobile
bun install          # 独立安装（Windows 本机可能因 RN 长路径失败；CI/EAS 在 Linux 上不受影响）
bun run typecheck    # tsc --noEmit（CI 强制）
bunx expo start      # Expo Go 开发
```

## 验证

- 类型检查：`.github/workflows/mobile.yml` 在 ubuntu 上 `bun install + typecheck`。
- 运行时：Expo Go / EAS Build（后续里程碑接入 EAS Maestro E2E）。
- 数据层契约：`expo-sqlite` 是原生模块，契约套件需真机/模拟器；
  由移动端里程碑在 Expo CI 挂载 `@celery/test-contracts`。

## 正式 UI（已实施）

- Expo Router 四入口：事项（项目切换/添加/滑动/长按/手动排序拖拽）、
  计划（@celery/core planning 时间桶分组）、搜索（防抖 LIKE）、设置（三主题）
- 项目管理：项目栏「＋」新建、长按 chip 重命名/删除（删除前二次确认，
  未完成事项先带项目名快照归档，与桌面端同语义）；首启 `ensureInbox`
  自动创建收集箱，全新安装开箱即用
- 滑动：右滑完成、左滑归档（react-native-gesture-handler Swipeable，到位即执行）
- 长按：操作面板（置顶/优先级/移动项目/归档，Modal 实现，零额外依赖）
- 手动排序：react-native-draggable-flatlist 原生拖拽 + 服务端 reorder 整组重编
- 主题：@celery/ui-tokens 的 themeLight/themeDark/themeCelery，持久化到本地
  settings 表（theme 键，字段命名与桌面端一致）

## 应用图标

`assets/`（icon / adaptive-icon / splash-icon）由仓库根
`scripts/generate-mobile-icons.mjs` 从品牌 SVG（与桌面端图标同源）生成，
`app.json` 引用路径；Android 经 `expo prebuild` 自动渲染各密度 mipmap，
EAS 同样直接生效。改品牌 Logo 后重跑脚本并提交产物即可。

## 后续里程碑

- Maestro E2E（随发布流水线）

## 发布（EAS）

- 配置仓库 Secret `EXPO_TOKEN`（eas login 后创建）→ 手动触发
  `.github/workflows/mobile-release.yml`，或本机 `cd apps/mobile && eas build`。
- `eas.json`：preview（APK 内测）/ production（AAB，android internal track）；
  iOS submit 的 Apple 账号在 eas.json 的 submit.production.ios 填写。
