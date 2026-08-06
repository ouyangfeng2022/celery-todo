# 更新日志

本项目所有重要变更均会记录于此文件。

格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
发版流程详见 [VERSIONING.md](./VERSIONING.md)。

## [Unreleased]

## [v2.17.0] - 2026-08-06
### Added
- 合并「导出当前项目」入口为统一对话框
- 支持导出项目为图片

### Fixed
- 让普通项的 hover 也触发回调以收起子菜单
- 修复子菜单 key 冲突与不自动收起

## [v2.16.0] - 2026-08-06
### Added
- 归档项目替代硬删除并优化确认弹窗布局
- allow dismissing sidebar update card
- add sticker entry to footer menu

### Fixed
- keep hover background on right-clicked project

## [v2.15.1] - 2026-08-06
### Added
- streamline filter transitions
- enhance cross-window data synchronization with incremental patches
- add performance measurement utilities for sync and async tasks
- add virtual list tests for scrolling and drag-and-drop functionality
- virtualize large todo lists
- optimize data updates and list rendering

### Fixed
- resolve bundled sql wasm asset
- update moduleResolution to node10 for consistency

## [v2.15.0] - 2026-08-05
### Added
- 右键菜单支持归档当前事项
- 新建待办改为 header + 按钮触发悬浮输入框
- 贴图支持新建待办、已完成沉底并加深字体
- update icon generation script and replace logo assets
- 支持空白处右键新建项目并接入导入导出

### Fixed
- 统一多行输入框为内容自适应+可滚动

## [v2.14.0] - 2026-08-04
### Added
- 将时间显示格式提升为全局持久化设置
- implement archive and restore notifications with undo functionality
- 支持点击直达最新版安装包

## [v2.13.0] - 2026-08-03
### Added
- add GFM and math rendering
- enhance project selection UI with improved styles and functionality
- 支持右键关闭贴图并新增 E2E 测试

## [v2.12.2] - 2026-07-31
### Fixed
- add fallback maintenance notes

## [v2.12.1] - 2026-07-31
## [v2.12.0] - 2026-07-31
### Added
- add descriptions during creation

## [v2.11.2] - 2026-07-31
### Fixed
- style priority in results

## [v2.11.1] - 2026-07-31
### Fixed
- make data mutations atomic

## [v2.11.0] - 2026-07-30
### Added
- global cross-project search with locate and a11y

## [v2.10.0] - 2026-07-30
### Added
- sync native theme icons and duplicate stickers
- add sticker shortcut to context menu
- separate palette and color mode

### Fixed
- group sticker context action

## [v2.9.2] - 2026-07-30
### Fixed
- 修正左耳裁切——正方形 viewBox + generate-icons 用 fit:contain

## [v2.9.1] - 2026-07-30
### Fixed
- 扩展 SVG viewBox 让兔耳不再贴边被裁

## [v2.9.0] - 2026-07-30
### Added
- reduce sticker preview rendering cost
- add celery visual identity
- 归档视图改版，支持搜索/筛选/按项目分组，并重命名为「已归档事项」

## [v2.8.0] - 2026-07-28
### Added
- 支持切换项目时保留输入框草稿
- 新增历史记录视图与导出工具，并精简贴图预设

### Fixed
- 项目切换时筛选条件同步派生，消除 useEffect 滞后一帧导致的残留问题

## [v2.7.1] - 2026-07-28
### Added
- 支持导出归档历史为 JSON 快照

### Fixed
- 设置页顶部栏复用主页面 Header 工具组，修复搜索/导入与设置页语境的交互死局
- 命令结束后关闭 IPC socket 避免进程挂起
- 修正 bin 入口路径为 dist-cli/index.js
- 为项目悬浮操作按钮添加 title 提示

## [v2.7.0] - 2026-07-24
### Added
- 新增全局键盘快捷键，重构顶部布局并调整主题
- 优化贴图预设预览首次加载卡顿问题

## [v2.6.0] - 2026-07-24
### Added
- 为项目/数据/窗口操作新增 Ctrl+Shift 快捷键
- 重构排序逻辑、顶部导航栏并新增主题系统
- 新增纸白(paper)主题模式

### Fixed
- 修复托盘「快速添加事项」事件无人订阅的死代码
- update background color for consistency across UI components
- align sidebar and toolbar layout

## [v2.5.2] - 2026-07-24
### Fixed
- 点击分组时也测量子菜单坐标,修复纯点击场景子菜单不渲染

## [v2.5.1] - 2026-07-24
### Fixed
- 修复左上角菜单下拉列表被父容器裁切不可见

## [v2.5.0] - 2026-07-24
### Added
- 贴图窗口复用主窗口排序逻辑并增加优先级样式

### Fixed
- 修复 IPC 监听器未卸载导致的内存泄漏与数据覆盖问题

## [v2.4.1] - 2026-07-23
### Added
- refine sidebar navigation and motion
- redesign sidebar updates and settings page
- 重构设置页为子页面结构并新增贴图样式设置
- 发现新版本时主动弹窗，下载/进度/重启在同一弹窗完成

### Fixed
- 跨窗口数据同步修复贴图完成无效
- auto-close dropdowns when clicking outside

## [v2.4.0] - 2026-07-22
### ⚠️ Breaking
- 移除「专注模式」设置与 `Ctrl+P` 快捷键，改由桌面简洁浮窗贴纸承担

### Added
- 新增「简洁模式」桌面浮窗贴纸，支持快速查看项目待办并标记完成
- 侧边栏新增进入简洁模式的快捷按钮
- 托盘菜单新增「创建浮窗」与「显示所有浮窗」入口
- 历史记录的恢复与永久删除加二次确认

### Fixed
- 优化简洁浮窗的窗口边缘与关闭控件
- 隔离项目切换时待办列表的动画，避免跨项目串扰

## [v2.3.0] - 2026-07-20
### Added
- 支持安装时自定义开机启动与数据目录
- 发现新版本时在 Header 主动提示，无需打开设置

## [v2.2.0] - 2026-07-17
### Added
- 区分「已完成」与「进行中」的空状态 UI

### Fixed
- 修复待办列表过长时输入框被滚走的问题

## [v2.1.0] - 2026-07-16
### Added
- 历史记录数量移至弹窗标题旁，归档列表改为无限滚动分页加载

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

[v2.1.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.1.0

[v2.2.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.2.0

[v2.3.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.3.0

[v2.4.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.4.0

[v2.4.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.4.1

[v2.5.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.5.0

[v2.5.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.5.1

[v2.5.2]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.5.2

[v2.6.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.6.0

[v2.7.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.7.0

[v2.7.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.7.1

[v2.8.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.8.0

[v2.9.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.9.0

[v2.9.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.9.1

[v2.9.2]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.9.2

[v2.10.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.10.0

[v2.11.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.11.0

[v2.11.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.11.1

[v2.11.2]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.11.2

[v2.12.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.12.0

[v2.12.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.12.1

[v2.12.2]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.12.2

[v2.13.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.13.0

[v2.14.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.14.0

[v2.15.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.15.0

[v2.15.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.15.1

[v2.16.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.16.0

[v2.17.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.17.0
