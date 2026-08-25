/**
 * @file 计划页：按时间桶（今天/明天/本周/以后/未安排/待重新安排）分组。
 * @description 桶分类复用 @celery/core 的 planning 纯函数，与桌面端时间视图同源。
 */

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TodoDto } from '@celery/data';
import { classifyPlannedDate, type TimeBucket } from '@celery/core';
import { useAppData } from '../../state/AppData';
import { alertError } from '../../utils/alertError';
import { palette } from '../../theme';
import { TodoRow } from '../../components/TodoRow';
import { TodoActionsSheet } from '../../components/TodoActionsSheet';
import { TodoDetailSheet } from '../../components/TodoDetailSheet';

const BUCKETS: { key: TimeBucket; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'tomorrow', label: '明天' },
  { key: 'week', label: '本周' },
  { key: 'later', label: '以后' },
  { key: 'unscheduled', label: '未安排' },
  { key: 'replan', label: '待重新安排' },
];

export default function PlanScreen() {
  const {
    theme,
    allTodos,
    refreshAllTodos,
    toggleTodo,
    archiveTodo,
    pinTodo,
    setPriority,
    setPlannedDate,
    updateTodoContent,
    moveTodo,
    projects,
  } = useAppData();
  const colors = palette(theme);
  const [sheetTodo, setSheetTodo] = useState<TodoDto | null>(null);
  const [detailTodo, setDetailTodo] = useState<TodoDto | null>(null);

  useEffect(() => {
    // 进入计划页时拉全量（时间视图跨项目）
    void refreshAllTodos();
  }, [refreshAllTodos]);

  const grouped = useMemo(() => {
    const map = new Map<TimeBucket, TodoDto[]>();
    for (const bucket of BUCKETS) map.set(bucket.key, []);
    for (const todo of allTodos) {
      if (todo.completed) continue;
      const bucket = classifyPlannedDate(todo.plannedDate ?? undefined, false);
      if (bucket) map.get(bucket)?.push(todo);
    }
    return map;
  }, [allTodos]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <Text style={[styles.header, { color: colors.textPrimary }]}>计划</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {BUCKETS.map(({ key, label }) => {
          const items = grouped.get(key) ?? [];
          if (items.length === 0) return null;
          return (
            <View key={key}>
              <Text style={[styles.groupTitle, { color: colors.textTertiary }]}>
                {label} · {items.length}
              </Text>
              {items.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  colors={colors}
                  onToggle={() => void toggleTodo(todo.id)}
                  onArchive={() => void archiveTodo(todo.id)}
                  onLongPress={() => setSheetTodo(todo)}
                />
              ))}
            </View>
          );
        })}
        {allTodos.filter((t) => !t.completed).length === 0 && (
          <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 48 }}>
            全部搞定
          </Text>
        )}
      </ScrollView>
      <TodoActionsSheet
        todo={sheetTodo}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        colors={colors}
        onClose={() => setSheetTodo(null)}
        onEdit={() => {
          if (sheetTodo) setDetailTodo(sheetTodo);
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
          if (sheetTodo) void setPlannedDate(sheetTodo.id, d).catch(alertError);
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
          if (detailTodo) void updateTodoContent(detailTodo.id, draft).catch(alertError);
          setDetailTodo(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
});
