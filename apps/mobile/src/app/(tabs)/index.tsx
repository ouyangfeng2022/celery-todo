/**
 * @file 事项页：项目切换 / 添加 / 排序与状态过滤 / 列表（滑动 + 长按）/ 手动拖拽排序。
 */

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, {
  ScaleDecorator,
  type DragEndParams,
} from 'react-native-draggable-flatlist';
import type { TodoDto, TodoFilter, TodoPriority, TodoSort } from '@celery/data';
import { formatPlannedDate } from '@celery/core';
import { useAppData } from '../../state/AppData';
import { palette, PRIORITY_DOT, PRIORITY_LABELS } from '../../theme';
import { TodoRow } from '../../components/TodoRow';
import { TodoActionsSheet } from '../../components/TodoActionsSheet';
import { TodoDetailSheet } from '../../components/TodoDetailSheet';
import { PlannedDateMenu } from '../../components/PlannedDateMenu';
import { ProjectSheet } from '../../components/ProjectSheet';
import type { ProjectView } from '../../state/AppData';

const FILTERS: { key: TodoFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'completed', label: '已完成' },
];

const SORTS: { key: TodoSort; label: string; hint: string }[] = [
  { key: 'created-desc', label: '按创建时间', hint: '新添加的在前' },
  { key: 'priority', label: '按优先级', hint: '高 → 中 → 低' },
  { key: 'manual', label: '自定义顺序', hint: '拖拽调整，长按菜单停用' },
];

export default function TodosScreen() {
  const {
    theme,
    ready,
    initError,
    projects,
    currentProject,
    currentProjectId,
    switchProject,
    createProject,
    renameProject,
    deleteProject,
    todos,
    todoSort,
    todoFilter,
    setTodoSort,
    setTodoFilter,
    reorder,
    addTodo,
    toggleTodo,
    archiveTodo,
    pinTodo,
    setPriority,
    setPlannedDate,
    updateTodoContent,
    batchSetCompleted,
    batchSetPriority,
    archiveTodos,
    moveTodo,
  } = useAppData();
  const colors = palette(theme);

  const [draft, setDraft] = useState('');
  const [priority, setPriorityState] = useState<TodoPriority>('medium');
  // 新建事项的计划日期（null = 不安排）；dateMenuOpen 控制输入行下的快捷菜单展开
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sheetTodo, setSheetTodo] = useState<TodoDto | null>(null);
  // 详情编辑面板目标事项（从长按面板「编辑内容」进入）
  const [detailTodo, setDetailTodo] = useState<TodoDto | null>(null);
  // 项目面板：null = 关闭；'create' = 新建；ProjectView = 长按管理
  const [projectSheet, setProjectSheet] = useState<'create' | ProjectView | null>(null);
  // 多选模式：点按勾选，底部操作栏批量完成/优先级/归档
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prioritySheetOpen, setPrioritySheetOpen] = useState(false);

  // 自定义顺序 = 拖拽模式（置顶分组由服务端排序保证）
  const manualSort = todoSort === 'manual';

  const enterSelection = (id?: string) => {
    setSelectionMode(true);
    setSelectedIds(id ? [id] : []);
  };
  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const allSelected = todos.length > 0 && selectedIds.length === todos.length;
  const runBatch = (fn: () => Promise<void>) => {
    void fn().then(exitSelection);
  };

  const submit = () => {
    const title = draft.trim();
    if (!title || !currentProjectId) return;
    setDraft('');
    setDraftDate(null);
    setDateMenuOpen(false);
    void addTodo(title, priority, draftDate);
  };

  const onDragEnd = ({ data }: DragEndParams<TodoDto>) => {
    void reorder(data.map((t) => t.id));
  };

  const row = (todo: TodoDto, drag?: () => void) => (
    <TodoRow
      todo={todo}
      colors={colors}
      onToggle={() => void toggleTodo(todo.id)}
      onArchive={() => void archiveTodo(todo.id)}
      onLongPress={() => {
        if (!manualSort) setSheetTodo(todo);
      }}
      dragHandle={
        manualSort && !selectionMode ? (
          <Pressable onPressIn={drag} hitSlop={12} style={styles.dragHandle}>
            <Text style={{ color: colors.textTertiary, fontSize: 16 }}>☰</Text>
          </Pressable>
        ) : undefined
      }
      selectionMode={selectionMode}
      selected={selectedIds.includes(todo.id)}
      onToggleSelect={() => toggleSelect(todo.id)}
    />
  );

  if (!ready) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 64 }}>
          正在初始化…
        </Text>
        {initError ? (
          <Text
            style={{
              color: colors.textSecondary,
              textAlign: 'center',
              marginTop: 12,
              marginHorizontal: 24,
            }}
          >
            初始化失败：{initError}
          </Text>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* 项目切换横条 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.projectBar}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      >
        {projects.map((p) => {
          const active = p.id === currentProjectId;
          return (
            <Pressable
              key={p.id}
              onPress={() => switchProject(p.id)}
              onLongPress={() => setProjectSheet(p)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.accent : colors.bgTertiary,
                  borderColor: active ? colors.accent : colors.border,
                },
              ]}
            >
              <Text
                style={{ color: active ? '#ffffff' : colors.textPrimary, fontSize: 13 }}
                numberOfLines={1}
              >
                {p.name}
                {p.activeCount > 0 ? ` ${p.activeCount}` : ''}
              </Text>
            </Pressable>
          );
        })}
        {/* 新建项目入口：移动端独立于桌面端，项目全程在本机创建管理 */}
        <Pressable
          onPress={() => setProjectSheet('create')}
          hitSlop={6}
          style={[styles.chip, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>＋</Text>
        </Pressable>
      </ScrollView>

      {/* 添加输入行（多选模式下隐藏，聚焦批量操作） */}
      {!selectionMode && (
        <View
          style={[
            styles.composer,
            { backgroundColor: colors.bgTertiary, borderColor: colors.border },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            returnKeyType="done"
            placeholder={currentProject ? `添加到「${currentProject.name}」` : '请先创建项目'}
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.textPrimary }]}
          />
          {/* 新建计划日期：点击展开快捷菜单，随事项一并提交 */}
          <Pressable
            onPress={() => setDateMenuOpen((v) => !v)}
            hitSlop={6}
            style={[styles.dateChip, { borderColor: draftDate ? colors.accent : colors.border }]}
          >
            <Text
              style={{
                fontSize: 12,
                color: draftDate ? colors.accent : colors.textTertiary,
              }}
            >
              {draftDate ? formatPlannedDate(draftDate) : '日期'}
            </Text>
          </Pressable>
          <View style={styles.prioritySwitch}>
            {(['high', 'medium', 'low'] as const).map((p) => (
              <Pressable key={p} onPress={() => setPriorityState(p)} hitSlop={6}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: priority === p ? '700' : '400',
                    color: priority === p ? colors.accent : colors.textTertiary,
                  }}
                >
                  {PRIORITY_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* 真机软键盘的回车键不直观（部分输入法显示为换行），提供显式添加按钮 */}
          <Pressable
            onPress={submit}
            disabled={!draft.trim() || !currentProjectId}
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor: colors.accent,
                opacity: !draft.trim() || !currentProjectId || pressed ? 0.5 : 1,
              },
            ]}
          >
            <Text style={styles.addBtnText}>添加</Text>
          </Pressable>
        </View>
      )}

      {/* 计划日期快捷菜单（输入行下方展开，选中即收起） */}
      {dateMenuOpen && !selectionMode && (
        <View
          style={[
            styles.dateMenu,
            { backgroundColor: colors.bgTertiary, borderColor: colors.border },
          ]}
        >
          <PlannedDateMenu
            current={draftDate}
            colors={colors}
            onPick={(d) => {
              setDraftDate(d);
              setDateMenuOpen(false);
            }}
          />
        </View>
      )}

      {selectionMode ? (
        /* 多选模式：选中计数 + 全选切换 + 退出 */
        <View style={styles.controlRow}>
          <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '600' }}>
            已选 {selectedIds.length} 项
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => setSelectedIds(allSelected ? [] : todos.map((t) => t.id))}
            hitSlop={6}
          >
            <Text style={{ fontSize: 13, color: colors.accent }}>
              {allSelected ? '全不选' : '全选'}
            </Text>
          </Pressable>
          <Pressable onPress={exitSelection} hitSlop={6} style={{ marginLeft: 18 }}>
            <Text style={{ fontSize: 13, color: colors.textTertiary }}>退出</Text>
          </Pressable>
        </View>
      ) : (
        /* 状态过滤 + 排序 + 多选入口（按项目持久化，与桌面端同键同义） */
        <View style={styles.controlRow}>
          {FILTERS.map(({ key, label }) => {
            const active = key === todoFilter;
            return (
              <Pressable key={key} onPress={() => setTodoFilter(key)} hitSlop={6}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: active ? '700' : '400',
                    color: active ? colors.accent : colors.textTertiary,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => enterSelection()} hitSlop={6}>
            <Text style={{ fontSize: 13, color: colors.textTertiary }}>多选</Text>
          </Pressable>
          <Pressable
            onPress={() => setSortMenuOpen(true)}
            hitSlop={6}
            style={[styles.sortChip, { borderColor: colors.border, marginLeft: 14 }]}
          >
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>
              {SORTS.find((s) => s.key === todoSort)?.label} ▾
            </Text>
          </Pressable>
        </View>
      )}

      {/* 列表：自定义顺序用 DraggableFlatList（原生拖拽），否则普通列表 */}
      {manualSort && !selectionMode ? (
        <View style={{ flex: 1 }}>
          <DraggableFlatList
            data={todos}
            keyExtractor={(t) => t.id}
            onDragEnd={onDragEnd}
            renderItem={({ item, drag, isActive }) => (
              <ScaleDecorator>
                <View style={{ opacity: isActive ? 0.85 : 1 }}>{row(item, drag)}</View>
              </ScaleDecorator>
            )}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: selectionMode ? 96 : 24 }}>
          {todos.map((todo) => (
            <View key={todo.id}>{row(todo)}</View>
          ))}
          {todos.length === 0 && (
            <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 48 }}>
              {todoFilter === 'all' ? '从一件小事开始' : '该视图暂无事项'}
            </Text>
          )}
        </ScrollView>
      )}

      {/* 多选模式底部操作栏 */}
      {selectionMode && (
        <View
          style={[
            styles.batchBar,
            { backgroundColor: colors.bgTertiary, borderColor: colors.border },
          ]}
        >
          <Pressable
            onPress={() => runBatch(() => batchSetCompleted(selectedIds, true))}
            disabled={selectedIds.length === 0}
            style={styles.batchBtn}
          >
            <Text
              style={{
                fontSize: 13,
                color: selectedIds.length ? colors.accent : colors.textTertiary,
              }}
            >
              完成
            </Text>
          </Pressable>
          <Pressable
            onPress={() => runBatch(() => batchSetCompleted(selectedIds, false))}
            disabled={selectedIds.length === 0}
            style={styles.batchBtn}
          >
            <Text
              style={{
                fontSize: 13,
                color: selectedIds.length ? colors.accent : colors.textTertiary,
              }}
            >
              取消完成
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPrioritySheetOpen(true)}
            disabled={selectedIds.length === 0}
            style={styles.batchBtn}
          >
            <Text
              style={{
                fontSize: 13,
                color: selectedIds.length ? colors.accent : colors.textTertiary,
              }}
            >
              优先级
            </Text>
          </Pressable>
          <Pressable
            onPress={() => runBatch(() => archiveTodos(selectedIds))}
            disabled={selectedIds.length === 0}
            style={styles.batchBtn}
          >
            <Text
              style={{
                fontSize: 13,
                color: selectedIds.length ? '#c0392b' : colors.textTertiary,
              }}
            >
              归档
            </Text>
          </Pressable>
        </View>
      )}

      {/* 批量设优先级 */}
      <Modal
        visible={prioritySheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPrioritySheetOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPrioritySheetOpen(false)}>
          <Pressable
            style={[styles.menuSheet, { backgroundColor: colors.bgTertiary }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>
              设为优先级（{selectedIds.length} 项）
            </Text>
            {(['high', 'medium', 'low'] as const).map((p) => (
              <Pressable
                key={p}
                onPress={() => {
                  setPrioritySheetOpen(false);
                  runBatch(() => batchSetPriority(selectedIds, p));
                }}
                style={({ pressed }) => [
                  styles.menuRow,
                  { backgroundColor: pressed ? colors.bgHover : 'transparent' },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: PRIORITY_DOT[p] }]} />
                <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
                  {PRIORITY_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* 排序方式选择 */}
      <Modal
        visible={sortMenuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortMenuOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSortMenuOpen(false)}>
          <Pressable
            style={[styles.menuSheet, { backgroundColor: colors.bgTertiary }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>排序方式</Text>
            {SORTS.map(({ key, label, hint }) => (
              <Pressable
                key={key}
                onPress={() => {
                  setTodoSort(key);
                  setSortMenuOpen(false);
                }}
                style={({ pressed }) => [
                  styles.menuRow,
                  { backgroundColor: pressed ? colors.bgHover : 'transparent' },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{label}</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 2 }}>
                    {hint}
                  </Text>
                </View>
                {todoSort === key && <Text style={{ color: colors.accent, fontSize: 15 }}>✓</Text>}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <TodoActionsSheet
        todo={sheetTodo}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        colors={colors}
        onClose={() => setSheetTodo(null)}
        onEdit={() => {
          if (sheetTodo) setDetailTodo(sheetTodo);
          setSheetTodo(null);
        }}
        onMultiSelect={() => {
          if (sheetTodo) enterSelection(sheetTodo.id);
          setSheetTodo(null);
        }}
        onPin={(pinned) => {
          if (sheetTodo) void pinTodo(sheetTodo.id, pinned);
          setSheetTodo(null);
        }}
        onSetPriority={(p) => {
          if (sheetTodo) void setPriority(sheetTodo.id, p);
          setSheetTodo(null);
        }}
        onSetPlannedDate={(d) => {
          if (sheetTodo) void setPlannedDate(sheetTodo.id, d);
          setSheetTodo(null);
        }}
        onMove={(projectId) => {
          if (sheetTodo) void moveTodo(sheetTodo.id, projectId);
          setSheetTodo(null);
        }}
        onArchive={() => {
          if (sheetTodo) void archiveTodo(sheetTodo.id);
          setSheetTodo(null);
        }}
      />

      <TodoDetailSheet
        todo={detailTodo}
        colors={colors}
        onClose={(draft) => {
          if (detailTodo) void updateTodoContent(detailTodo.id, draft);
          setDetailTodo(null);
        }}
      />

      <ProjectSheet
        visible={projectSheet !== null}
        target={
          projectSheet && projectSheet !== 'create'
            ? { id: projectSheet.id, name: projectSheet.name, kind: projectSheet.kind }
            : null
        }
        colors={colors}
        onClose={() => setProjectSheet(null)}
        onCreate={(name) => {
          setProjectSheet(null);
          void createProject(name);
        }}
        onRename={(id, name) => {
          setProjectSheet(null);
          void renameProject(id, name);
        }}
        onDelete={(id) => {
          setProjectSheet(null);
          void deleteProject(id);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  projectBar: { flexGrow: 0, paddingVertical: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  input: { flex: 1, paddingVertical: 10, fontSize: 15 },
  dateChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 10,
  },
  dateMenu: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 10,
  },
  prioritySwitch: { flexDirection: 'row', gap: 10, paddingLeft: 10 },
  addBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 10,
  },
  addBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  sortChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 12,
    paddingBottom: 32,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 10,
  },
  batchBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
  },
  batchBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dragHandle: { paddingRight: 8 },
});
