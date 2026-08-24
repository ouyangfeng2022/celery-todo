/**
 * @file 搜索页：标题/描述子串搜索（仓储 LIKE 实现，跨项目）。
 */

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TodoDto } from '@celery/data';
import { useAppData } from '../../state/AppData';
import { palette } from '../../theme';
import { TodoRow } from '../../components/TodoRow';
import { TodoActionsSheet } from '../../components/TodoActionsSheet';
import { TodoDetailSheet } from '../../components/TodoDetailSheet';

export default function SearchScreen() {
  const {
    theme,
    projects,
    search,
    toggleTodo,
    archiveTodo,
    pinTodo,
    setPriority,
    setPlannedDate,
    updateTodoContent,
    moveTodo,
  } = useAppData();
  const colors = palette(theme);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<TodoDto[]>([]);
  const [sheetTodo, setSheetTodo] = useState<TodoDto | null>(null);
  const [detailTodo, setDetailTodo] = useState<TodoDto | null>(null);

  useEffect(() => {
    const keyword = term.trim();
    if (!keyword) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void search(keyword).then((hits) => {
        if (!cancelled) setResults(hits);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, search]);

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? '';
  }, [projects]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <Text style={[styles.header, { color: colors.textPrimary }]}>搜索</Text>
      <View
        style={[
          styles.composer,
          { backgroundColor: colors.bgTertiary, borderColor: colors.border },
        ]}
      >
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="搜索标题与描述"
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, { color: colors.textPrimary }]}
          autoFocus
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {term.trim() !== '' && results.length === 0 && (
          <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 48 }}>
            没有匹配的事项
          </Text>
        )}
        {results.map((todo) => (
          <View key={todo.id}>
            <Text style={[styles.projectTag, { color: colors.textTertiary }]}>
              {projectName(todo.projectId)}
            </Text>
            <TodoRow
              todo={todo}
              colors={colors}
              highlight={term.trim() || undefined}
              onToggle={() => void toggleTodo(todo.id)}
              onArchive={() => void archiveTodo(todo.id)}
              onLongPress={() => setSheetTodo(todo)}
            />
          </View>
        ))}
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
  composer: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  input: { paddingVertical: 10, fontSize: 15 },
  projectTag: {
    fontSize: 11,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
});
