# 更新日志

本项目所有重要变更均会记录于此文件。

格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
发版流程详见 [VERSIONING.md](./VERSIONING.md)。

## [Unreleased]

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
