# 更新日志

本项目所有重要变更均会记录于此文件。

格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
发版流程详见 [VERSIONING.md](./VERSIONING.md)。

## [Unreleased]

## [v2.0.0] - 2026-07-16
### ⚠️ Breaking
- 移除事项的截止日期与到期提醒功能（v2.0.0）

### Added
- 为置顶待办项添加背景色与左侧色条
- 添加置顶功能
- 启动时恢复上次激活的项目
- add dual-mode IPC architecture for CLI↔GUI real-time sync
- 添加 celery 命令行，直接管理桌面应用 SQLite 数据库
- add focus mode toggle setting and improve update status display

### Fixed
- 增强优先级在所有位置的视觉区分度
- 修复归档按钮导致排序选择框位置偏移的问题
- 排序方式与状态筛选按项目独立持久化
- 完成全部待办后只显示「全部搞定」并支持点击对号归档
- enable native context menu for text selection in todo content

## [v1.5.2] - 2026-07-13
### Added
- use native context menu for text selection - remove custom copy menu
- 检查更新使用刷新图标替代下载图标

### Fixed
- 为历史记录操作按钮添加悬浮提示
- 重置所有数据使用正确的UploadIcon图标
- 拖拽自动切入手动排序时不跳序 - 先快照当前显示顺序再切换

## [v1.5.1] - 2026-07-13
### Added
- 新增仓库健康检查脚本 check-repo-health
- 将事项"删除"按钮统一改为"归档" (#7)

### Fixed
- 修复快速连续切换筛选时列表卡死 (#6)

## [v1.5.0] - 2026-07-13
### Added
- 右键标题/描述弹出复制菜单 (#2)
- 限制拖拽仅竖直方向，列表只能上下重排 (#4)

### Fixed
- 修复切换筛选时列表卡死 (#3)

## [v1.4.1] - 2026-07-13
### Added
- 精简打包产物体积

### Fixed
- notifications.spec.ts 缺少 createProject 导致 AddTodoInput 不渲染

## [v1.4.0] - 2026-07-10
### Added
- 删除改为归档，设置新增历史记录页
- 关于区块新增 GitHub 仓库链接
- 侧边栏项目名后显示未完成 todo 数

## [v1.3.0] - 2026-07-10
### Added
- 彻底移除默认项目概念
- 全部完成时显示庆祝卡片 + confetti 撒花

## [v1.2.1] - 2026-07-09
### Added
- 显示待办完成时间
- 非手动排序下拖拽自动切换为手动排序
- 回收站列表显示项目名

## [v1.2.0] - 2026-07-08
### Added
- 项目列表支持拖拽排序（整行可拖，按住任意位置拖动；小于 5px 视为点击切换项目）
- 设置面板「检查更新」提示加入语义颜色与动画（旋转/弹性打钩/进度过渡/失败抖动）

### Changed
- 放大侧边栏「项目」标签字号（11px eyebrow → 14px 普通粗体）

### Internal
- `projects` 表新增 `sort_order` 列，DB_VERSION 1 → 2，迁移按 `created_at` 顺序回填，升级后顺序与升级前一致

## [v1.1.0] - 2026-07-07
### Added
- 集成 electron-updater 实现应用内自动升级

### Fixed
- 批量添加改为仅按换行分隔，标题允许逗号和分号
- Markdown 描述中的外链改用系统默认浏览器打开
- 修复新建待办误显示为"昨天创建"

## [v1.0.3] - 2026-07-07
### Fixed
- 修复生产构建卡在初始界面

### Internal
- 默认安装到 Program Files (x86)

## [v1.0.2] - 2026-07-06
### Added
- 引入 schema 迁移机制 (MIGRATIONS + migrateDatabase)

## [v1.0.1] - 2026-07-06
### Added
- 替换对号为 Logo 并修复创建项目切换
- 侧边栏切换按钮改为悬浮箭头手柄
- 新增应用 Logo 并替换 favicon
- 新增专注模式并隐藏 Electron 标题栏
- 支持自定义数据存储位置

### Fixed
- 收紧 viewBox 四周留白并重新生成图标
- 修复 framer-motion popLayout 向 SortableTodoItem 注入 ref 的警告
- 修复侧边栏下半部分背景缺失
- 改用纯 CSS width transition 彻底解决半色与动画问题
- 彻底修复侧边栏背景半色问题
- 修复收起后无法展开及背景色显示不全
- Electron 窗口/托盘图标显示为默认 React 图标
- 修复通知无法标记已读并避免到期提醒跨重启重复
- 悬浮事项时批量复选框垂直居中并显示在最右侧
- 悬浮项目时隐藏默认徽章避免与操作按钮重叠
- 优化添加事项优先级栏的展开/收起动画

## [v1.0.0] - 2026-07-04

### Added

- 首个公开版本：基于 Electron + React 18 + TypeScript 的桌面端 Todo 应用。
- 多项目管理、优先级、截止日期、Markdown 描述、`@dnd-kit` 拖拽排序。
- 筛选 / 排序 / 批量操作 / 30 天回收站 / 键盘快捷键。
- 浅色 / 深色 / 跟随系统主题。
- SQLite (sql.js WASM) + IndexedDB 持久化，500ms 防抖自动保存。
- JSON / CSV 导入导出，单项目与全量备份。
- Electron 桌面集成：系统托盘、最小化到托盘、开机自启、桌面通知、自定义数据存储位置。
- 专注模式：隐藏侧边栏 / 统计 / 筛选，仅保留标题与列表。

[v1.0.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.0.0

[v1.0.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.0.1

[v1.0.2]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.0.2

[v1.0.3]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.0.3

[v1.1.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.1.0

[v1.2.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.2.0

[v1.2.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.2.1

[v1.3.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.3.0

[v1.4.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.4.0

[v1.4.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.4.1

[v1.5.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.5.0

[v1.5.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.5.1

[v1.5.2]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v1.5.2

[v2.0.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.0.0
