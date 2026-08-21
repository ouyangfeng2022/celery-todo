/**
 * @file 事项页：项目切换 / 添加 / 列表（滑动 + 长按）/ 手动排序拖拽。
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, {
  ScaleDecorator,
  type DragEndParams,
} from 'react-native-draggable-flatlist';
import type { TodoDto, TodoPriority } from '@celery/data';
import { useAppData } from '../../state/AppData';
import { palette, PRIORITY_LABELS } from '../../theme';
import { TodoRow } from '../../components/TodoRow';
import { TodoActionsSheet } from '../../components/TodoActionsSheet';
import { ProjectSheet } from '../../components/ProjectSheet';
import type { ProjectView } from '../../state/AppData';

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
    reorder,
    addTodo,
    toggleTodo,
    archiveTodo,
    pinTodo,
    setPriority,
    moveTodo,
  } = useAppData();
  const colors = palette(theme);

  const [draft, setDraft] = useState('');
  const [priority, setPriorityState] = useState<TodoPriority>('medium');
  const [manualSort, setManualSort] = useState(false);
  const [sheetTodo, setSheetTodo] = useState<TodoDto | null>(null);
  // 项目面板：null = 关闭；'create' = 新建；ProjectView = 长按管理
  const [projectSheet, setProjectSheet] = useState<'create' | ProjectView | null>(null);

  const visible = useMemo(() => {
    // 非手动排序时置顶恒浮顶（与服务端排序语义一致）
    const pinned = todos.filter((t) => t.pinned);
    const rest = todos.filter((t) => !t.pinned);
    return manualSort ? todos : [...pinned, ...rest];
  }, [todos, manualSort]);

  const submit = () => {
    const title = draft.trim();
    if (!title || !currentProjectId) return;
    setDraft('');
    void addTodo(title, priority);
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
        manualSort ? (
          <Pressable onPressIn={drag} hitSlop={12} style={styles.dragHandle}>
            <Text style={{ color: colors.textTertiary, fontSize: 16 }}>☰</Text>
          </Pressable>
        ) : undefined
      }
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

      {/* 添加输入行 */}
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

      {/* 手动排序开关 */}
      <Pressable onPress={() => setManualSort((v) => !v)} style={styles.sortToggle} hitSlop={8}>
        <Text style={{ color: manualSort ? colors.accent : colors.textTertiary, fontSize: 12 }}>
          {manualSort ? '拖拽排序中 · 点按结束' : '手动排序'}
        </Text>
      </Pressable>

      {/* 列表：手动排序用 DraggableFlatList（原生拖拽），否则普通 FlatList */}
      {manualSort ? (
        <View style={{ flex: 1 }}>
          <DraggableFlatList
            data={visible}
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
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {visible.map((todo) => (
            <View key={todo.id}>{row(todo)}</View>
          ))}
          {visible.length === 0 && (
            <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 48 }}>
              从一件小事开始
            </Text>
          )}
        </ScrollView>
      )}

      <TodoActionsSheet
        todo={sheetTodo}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        colors={colors}
        onClose={() => setSheetTodo(null)}
        onPin={(pinned) => {
          if (sheetTodo) void pinTodo(sheetTodo.id, pinned);
          setSheetTodo(null);
        }}
        onSetPriority={(p) => {
          if (sheetTodo) void setPriority(sheetTodo.id, p);
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
  prioritySwitch: { flexDirection: 'row', gap: 10, paddingLeft: 10 },
  addBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 10,
  },
  addBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  sortToggle: { alignSelf: 'flex-end', paddingRight: 18, paddingBottom: 6 },
  dragHandle: { paddingRight: 8 },
});
