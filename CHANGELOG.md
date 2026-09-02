# 更新日志

本项目所有重要变更均会记录于此文件。

格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
发版流程详见 [VERSIONING.md](./VERSIONING.md)。

## [Unreleased]

### Fixed

- 修复 2.20.2 安装包启动后停留在加载页无限转圈的问题：hoisted 布局下
  `electron-rebuild` 静默漏建 better-sqlite3，安装包内是 Node/Bun ABI 的预编译
  产物，首个数据查询即 dlopen 失败。`rebuild:electron` 显式把构建根指向仓库
  并新增 Electron ABI 验证闸门（`scripts/verify-native-abi.mjs`），打包前实际
  加载原生模块，不匹配立即失败
- 恢复 2.x 的数据目录：打包产物 package.json 缺少顶层 `productName`，monorepo
  改名后 userData 漂移到 `%APPDATA%\@celery\desktop-electron`，升级用户的数据
  与升级器缓存不可见；补回 `productName: "celery-todo"` 后与旧版完全一致
- 应用初始化失败时在加载页展示错误信息并写入控制台，不再只显示转圈

## [v3.4.1] - 2026-09-02

### Fixed

- 桌面端：Markdown 描述等任何 url 点击统一改由系统默认浏览器打开，不再在
  当前窗口内导航（此前会把整个应用页面替换成目标网址、无法返回）；
  「帮助」按钮同步改走系统浏览器。主窗口与贴图浮窗均生效

## [v3.4.0] - 2026-08-31

### Added

- 桌面端：设置新增「网络代理」——应用内检查/下载更新可走系统代理
  （Windows 读取系统代理设置）或自定义 http 代理地址，改后即时生效
  无需重启；默认关闭保持直连。背景：国内直连 GitHub 超时会让检查更新
  报「error sending request for url」，而更新器不读系统代理

### Fixed

- 桌面端：网络无法直连 GitHub 时检查更新展示原始 reqwest 报错，现翻译为
  「无法连接更新服务器（GitHub），请检查网络或代理后重试」

## [v3.3.1] - 2026-08-26

### Fixed

- 桌面端：项目全部完成后「全部完成」庆祝卡无条件顶替列表——全部/进行中/
  已完成三个分类的内容区都被庆祝卡替换，事项本体不可见而统计数字仍在，
  直到新增任意事项才恢复。现庆祝卡仅在「全部」分类显示，「进行中」「已
  完成」如实渲染列表
- 桌面端：批量操作栏的完成/取消完成按钮改为按选中项实际状态显示——未完成
  事项不再出现「取消完成」，已完成事项不再出现「完成」；混合选中两者皆有
- 移动端：数据层审计修复——外键约束开启（拒绝含孤儿事项的导入文件）、
  备份抽取截断即中止导出、异步兜底不再静默吞错、导入后重建收集箱
- 桌面 Electron 2.x 壳：补齐 AppSettings.startupWindow 默认值

### Changed

- 桌面端：日期选择框样式优化——原生日历跟随明暗主题、chip 补边框与焦点态
- CI：mobile.yml 增加 push 触发——直推 main 不再绕过移动端类型检查

## [v3.3.0] - 2026-08-24

### Added

- 移动端补齐 11 项实用功能（与桌面端对齐）：
  - 计划日期可写：创建行日期 chip 与长按菜单快捷安排（今天/明天/下周一/
    自选日期），计划页六桶分组由此点亮
  - 事项标题/描述编辑（长按 → 编辑内容，关闭时保存）
  - 已归档事项历史：搜索 / 状态过滤 / 恢复（原项目已删时回收集箱）/
    彻底删除 / 清空
  - 列表排序（创建时间/优先级/自定义拖拽）与状态过滤
    （全部/进行中/已完成），按项目持久化，切换项目自动恢复视图偏好
  - v3 JSON 备份导出/导入：防设备丢失；导出走系统分享，导入覆盖前
    计数确认（`celery-todo/v3` 格式）
  - 批量多选：完成 / 取消完成 / 设优先级 / 归档
  - 统计面板：指标卡、26 周完成热力图、连续天数、优先级与项目分布
    （口径含已归档）
  - 项目模板：项目存为模板 / 从模板新建（计划日期偏移以当天为起点）
  - 项目拖拽排序（收集箱固定置顶，与桌面端语义一致）
  - 项目颜色（六色预设，取自 ui-tokens 色阶）
  - 搜索结果关键词高亮

### Fixed

- 安卓 APK 固定上传证书签名：此前每个版本用 CI 上临时生成的 debug
  keystore 签名，相邻版本证书不同，侧载用户无法原地升级
  （INSTALL_FAILED_UPDATE_INCOMPATIBLE）。注意：从 v3.2.0 的 APK 升级到
  本版仍需卸载重装一次（一次性换签，本机数据会清空，请先导出备份），
  此后版本间可原地升级
- 移动端：真机软键盘下创建确认可达——事项输入行加显式「添加」按钮，
  项目面板键盘抬升

### Changed

- 桌面端：移除事项动作栏冗余「编辑」按钮——点击事项本体即开详情

## [v3.2.0] - 2026-08-18

### Added

- 发版流水线自动构建安卓 APK：v3* 标签此后除桌面三端安装包与 CLI 外，
  同时构建移动端 APK 附到同一 Release（debug keystore 签名、可直接侧载，
  上 Google Play 仍走 EAS 线）；构建前按标签同步移动端版本号与
  `versionCode`，保证升级单调递增。移动端目前仍是骨架 UI，APK 仅供尝鲜
- 移动端新增 Metro monorepo 配置（`apps/mobile/metro.config.js`）：修复
  共享包（`@celery/*`）经 `file:` 软链引用时 Metro 无法解析打包的问题，
  本地与 CI 构建 APK 均依赖此配置

## [v3.1.0] - 2026-08-16

### Added

- 数据存储位置自定义（设置 → 数据 → 数据存储位置）：v3 数据库可迁移到
  自选目录并随时迁回默认；迁移在同一把数据库连接锁内完成
  （checkpoint → 拷贝 → 重开），失败自动回滚；CLI 与桌面端共用同一
  配置解析，迁移后两端仍读写同一份数据
- 主窗口最大化状态跨重启记忆（此前仅记忆位置与尺寸）

### Fixed

- 修复 CLI 的桌面刷新通知在自定义数据目录下失联：CLI 此前在 db 同目录
  找 cli-notify.json，而桌面端恒发布在 appData 根，目录迁移后两端错位，
  现统一为 appData 根

## [v3.0.1] - 2026-08-16

### Fixed

- 修复 Windows 下进入简洁模式后应用"假死"的问题：
  `sticker_create` / `sticker_duplicate` 是同步命令且内部直接创建
  `WebviewWindow`，在 IPC 回调里死锁主线程（wry#583，Tauri 文档明确标注的
  反模式）。死锁后所有 IPC 永久挂起，表现为切换项目不加载其他项目、归档页
  空白、无法切换卡片模式、导出无反应。两命令改为 async（运行时线程建窗），
  托盘「新建简洁模式浮窗」同样改为独立线程创建
- 修复托盘「退出」可能无效的问题 —— `app.exit(0)` 依赖事件循环消费退出
  请求，主线程卡死时永远无法退出；`quit_app` 落盘窗口状态并清理 CLI 通知
  文件后增加看门狗线程，宽限期后强杀进程兜底
- 修复设置页版本号显示为 2.20.0 —— Vite 注入的 `__APP_VERSION__` 读的是
  workspace 包版本（跟随 2.x Electron 发版线），改为读
  `src-tauri/tauri.conf.json` 的 version（3.0 桌面线的唯一版本源）
- 修复优先级（高/中/低）标签颜色丢失 —— `PRIORITY_COLORS` 的 Tailwind
  类名常量位于 `@celery/core` 源码，content 未覆盖该目录导致类被 purge；
  Tailwind content 纳入 `packages/core/src`（2.x 迁移壳同步修复）

## [v3.0.0] - 2026-08-15

### Added

- 全新 Tauri 2 + React + Rust 跨平台桌面端，提供 Windows、macOS（Intel / Apple Silicon）与 Linux 安装包
- `celery-db` SQLite 数据层：WAL、外键、FTS5 搜索、游标分页及事务性批量写入
- 共享领域内核、Repository 契约、跨端设计 token 与数据适配层
- Rust CLI `celery`，支持项目、待办、完成与归档操作，并与桌面端共用 v3 数据库
- 系统托盘、桌面贴图浮窗、自启动、窗口状态记忆、单实例、原生保存对话框和自动更新
- 可检测并从本机 2.x 数据库导入数据；v3 导出格式为 `celery-todo/v3`

### Changed

- 桌面端从 Electron / sql.js 迁移至 Tauri / 原生 SQLite；2.x Electron 壳保留在 `apps/desktop-electron/`，仅作迁移对照
- 仓库重组为 Bun workspaces + Turborepo monorepo

### Security

- 正式发行的 Windows、Linux AppImage / deb 与 macOS app 更新产物均附带更新签名；`latest.json` 提供自动更新清单

## [v2.20.0] - 2026-08-14

### Added

- 贴图加返回主窗口按钮，主页面右上角加简洁模式入口
- 本周安排改为点击添加就地展开输入框
- 虚拟化阈值提到 200，中等列表留在渐进挂载
- 虚拟列表直写 DOM，滚动时跳过 React 更新
- 中等列表渐进挂载，筛选切换先画骨架
- virtualize lists from 30 items
- 新增事项详情浮窗，迁移编辑与描述展示

### Fixed

- 顶栏标题行高改 leading-normal，避免 truncate 裁切拉丁降部
- 项目菜单脱离透明度合成层并支持滚动，附 header 视觉打磨
- 虚拟列表 ref 回调移到早返回之前，修复 rules-of-hooks
- 完成复选框补 title，悬浮显示状态切换提示
- 切换项目时保持统计面板常驻，避免进度条重播
- 整张卡片点击空白也能打开详情浮窗
- make card view a true card wall instead of stretched list
- align import-export version assertion with EXPORT_FORMAT_VERSION=6

## [v2.19.4] - 2026-08-12

### Added

- add permanent delete option to project context menu
- coalesce data-change reloads to cut IPC frequency

### Fixed

- surface create/rename/reorder failures via safeRun
- surface project delete failures and complete wiring
- include archived projects in history filter dropdown
- surface store action errors via alert
- assign inbox sort_order on server to avoid duplicates

## [v2.19.3] - 2026-08-11

### Added

- add date-grouped card view
- add template dialog and time view components
- redesign weekly planning
- add weekly project visibility control
- add one-click weekly todo projects

### Fixed

- replace template sparkle icon
- preserve project names after project archival
- show custom order in sort selector

### Documentation

- refresh preview screenshots

## [v2.19.2] - 2026-08-10

### Fixed

- stabilize virtual keyboard drag in large lists
- 修 PR #15 暴露出的 sticker/virtual-list 回归
- rebuild native modules for Electron ABI in CI

## [v2.19.1] - 2026-08-07

### Added

- move desktop persistence to main process

## [v2.19.0] - 2026-08-07

### Added

- show completed export location
- Refactor data export functionality and introduce unified export dialog

## [v2.18.0] - 2026-08-06

### Added

- 新增统计页（设置页内）支持热力图/优先级/项目分布

### Fixed

- 热力图月份标签不再被压缩折行
- 返回待办后立即点击不再被退场浮层拦截

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
[v2.18.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.18.0
[v2.19.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.19.0
[v2.19.1]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.19.1
[v2.19.2]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.19.2
[v2.19.3]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.19.3
[v2.19.4]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.19.4
[v2.20.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v2.20.0
[v3.0.0]: https://github.com/ouyangfeng2022/celery-todo/releases/tag/v3.0.0
