# @celery/mobile — Celery Todo 3.0 移动端（Expo）

Expo + React Native（New Architecture）骨架，数据层复用 `@celery/data` 的
Repository 契约（`src/data/expo-sqlite-repositories.ts`，v3 schema 与桌面端一致）。

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

## 里程碑待办（3.0 计划第 5 步）

- Expo Router 四入口（事项 / 计划 / 搜索 / 设置）
- 滑动完成/归档、长按批量、手动排序模式的原生拖拽
- 主题切换接 `@celery/ui-tokens` 的 dark/celery 主题
