/**
 * @file 3.0 移动端骨架界面
 * @description 验证「RN UI → @celery/data 契约 → expo-sqlite → v3 schema」全链。
 *              正式移动 UI（四入口导航 / 滑动完成 / 长按批量 / 原生拖拽）
 *              在移动端里程碑按 3.0 计划实现。
 */

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import type { TodoDto } from '@celery/data';
import { coral, sand, space, radius, fontNative, themeLight } from '@celery/ui-tokens';
import { createExpoSqliteRepositories } from './data/expo-sqlite-repositories';

const repos = createExpoSqliteRepositories();

export default function App() {
  const [todos, setTodos] = useState<TodoDto[]>([]);
  const [title, setTitle] = useState('');

  const refresh = useCallback(async () => {
    const page = await repos.todos.page({
      projectId: null,
      filter: 'active',
      priority: null,
      plannedFrom: null,
      plannedTo: null,
      sort: 'created-desc',
      limit: 50,
      cursor: null,
    });
    setTodos(page.items);
  }, []);

  useEffect(() => {
    (async () => {
      await repos.projects.ensureInbox();
      await refresh();
    })();
  }, [refresh]);

  const add = async () => {
    const t = title.trim();
    if (!t) return;
    const inbox = await repos.projects.ensureInbox();
    await repos.todos.create({
      id: crypto.randomUUID(),
      projectId: inbox.id,
      title: t,
      description: null,
      priority: 'medium',
      plannedDate: null,
      pinned: false,
      rank: Date.now(),
    });
    setTitle('');
    await refresh();
  };

  const complete = async (todo: TodoDto) => {
    await repos.todos.update(todo.id, { completed: true });
    await refresh();
  };

  return (
    <View style={styles.screen}>
      <ExpoStatusBar style="dark" />
      <Text style={styles.heading}>Celery Todo</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="添加事项…"
          placeholderTextColor={sand[500]}
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={add}
        />
      </View>
      <FlatList
        data={todos}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => complete(item)}>
            <View style={styles.check} />
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.pinned ? '📌 ' : ''}
              {item.title}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>暂无待办事项</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: themeLight.bgPrimary,
    paddingTop: StatusBar.currentHeight ?? 32,
    paddingHorizontal: space[4],
  },
  heading: {
    fontFamily: fontNative.heading,
    fontSize: 22,
    color: coral[500],
    fontWeight: '600',
    marginVertical: space[4],
  },
  inputRow: { marginBottom: space[3] },
  input: {
    backgroundColor: themeLight.bgTertiary,
    borderWidth: 1,
    borderColor: themeLight.border,
    borderRadius: radius.md,
    padding: space[3],
    fontSize: 15,
    color: themeLight.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: themeLight.bgTertiary,
    borderColor: themeLight.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space[3],
    marginBottom: space[2],
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: themeLight.borderStrong,
  },
  rowTitle: { flex: 1, fontSize: 15, color: themeLight.textPrimary },
  empty: { color: sand[500], textAlign: 'center', marginTop: space[8] },
});
