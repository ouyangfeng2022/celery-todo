# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Celery Todo** - a full-featured Todo List application with Celery-style UI, built as an Electron desktop app with React frontend and SQLite database for persistence.

## Commonly Used Commands

```bash
# Development (web only)
bun dev              # Start Vite dev server on http://localhost:5173

# Development (Electron app)
bun run electron:dev # Start Electron app with Vite dev server

# Build
bun run build        # Build React app only
bun run build:electron  # Build React + Electron TypeScript
bun run electron:build  # Build full Electron executable

# Tests
bun test             # Run Vitest in watch mode
bun run test:ui      # Run Vitest with UI
bun run test:run     # Run tests once
bun run test:coverage # Run tests with coverage

# Lint & Format
bun run lint         # Run ESLint
bun run format       # Run Prettier formatting
```

## High-Level Architecture

### Technology Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **State Management**: Zustand (stores in `src/store/`)
- **Database**: sql.js (SQLite compiled to WASM) + IndexedDB for persistence
- **Desktop**: Electron + Vite
- **Testing**: Vitest + Testing Library
- **Animations**: Framer Motion
- **Drag & Drop**: @dnd-kit

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Components                     │
│  (Header, TodoList, ProjectSidebar, SettingsPanel, etc.)│
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   Custom Hooks                          │
│  useTodos, useProjects, useFilter, useTheme, etc.       │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  Zustand Stores                         │
│  useTodoStore, useProjectStore, useSettingsStore, etc.  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                SQLite Database Layer                    │
│  src/utils/database.ts - sql.js WASM + IndexedDB        │
│  Tables: projects, todos, deleted_todos, settings,      │
│          notifications                                  │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Patterns

1. **Database Persistence**: 
   - SQLite runs in WASM via sql.js
   - Database binary saved to IndexedDB with debounce auto-save (500ms)
   - Manual flush via `flushSave()`

2. **Store Pattern (Zustand)**:
   - Each domain has its own store: `useTodoStore`, `useProjectStore`, `useSettingsStore`, `useNotificationStore`
   - Stores directly call database functions - no extra abstraction layer
   - Hooks like `useTodos` wrap stores for component consumption

3. **Multi-Project Support**:
   - Each todo belongs to a project
   - Switching project reloads todos via `useTodoStore.getState().loadProject(projectId)`
   - Default project created automatically

4. **Recycle Bin System**:
   - Deleted todos move to `deleted_todos` table with 30-day expiration
   - `expires_at` timestamp for auto-cleanup
   - Restore function moves items back to `todos` table

5. **Electron Integration**:
   - Main process: `electron/main.ts` (window management, tray, auto-start)
   - Preload: `electron/preload.ts` (IPC bridge)
   - Tray: `electron/tray.ts` (system tray icon)
   - Window position persisted to `window-state.json` in userData

### Database Schema

```sql
projects: id, name, color, created_at, updated_at
todos: id, project_id, title, description, completed, priority, due_date, 
       created_at, updated_at, completed_at, sort_order
deleted_todos: same as todos + deleted_at, expires_at
settings: key, value (K-V store)
notifications: id, type, title, message, todo_id, created_at, read
```

### Important File Locations

- `src/utils/database.ts` - All SQLite data access functions
- `src/store/useTodoStore.ts` - Todo state management (most complex store)
- `src/App.tsx` - Root component, application initialization
- `electron/main.ts` - Electron main process
- `src/types.ts` - Shared TypeScript types

### Code Conventions

- Chinese comments in source files (`.ts`, `.tsx`) - codebase is primarily Chinese
- CamelCase for TypeScript interfaces, snake_case for database columns
- Row mapping functions: `rowToTodo()`, `rowToProject()` for DB → TypeScript conversion
- Bulk operations supported: `addTodosBulk()`, `batchAction()`, `deleteTodos()`
- Keyboard shortcuts via `useKeyboardShortcuts()` hook
