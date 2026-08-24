/**
 * @file 已归档事项历史：搜索 / 状态过滤 / 增量加载 / 恢复 / 彻底删除 / 清空。
 * @description 入口在设置页「已归档事项」。此前归档在 UI 上完全不可见、无法恢复
 *              （数据只进不出）。恢复回原项目，原项目已被删除时回收集箱；
 *              归档永久保留（与桌面端一致），清理只能显式操作。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ArchivedTodoDto } from '@celery/data';
import { useAppData } from '../state/AppData';
import { palette, PRIORITY_DOT } from '../theme';

type StatusFilter = 'all' | 'active' | 'completed';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '未完成' },
  { key: 'completed', label: '已完成' },
];

interface ArchiveHistorySheetProps {
  visible: boolean;
  onClose: () => void;
}

export function ArchiveHistorySheet({ visible, onClose }: ArchiveHistorySheetProps) {
  const {
    theme,
    archived,
    archivedExhausted,
    loadArchived,
    restoreArchivedTodo,
    purgeArchivedTodo,
    clearArchived,
  } = useAppData();
  const colors = palette(theme);
  const [term, setTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // 行内「删除」两步确认（同一时间只有一行处于确认态）
  const [pendingPurgeId, setPendingPurgeId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // 记录最近一次已派发的搜索词，跳过打开面板时的首跑（避免与初始加载重复）
  const dispatchedTermRef = useRef('');

  // 打开时重置过滤与确认态，从头加载
  useEffect(() => {
    if (visible) {
      setTerm('');
      setStatusFilter('all');
      setPendingPurgeId(null);
      setConfirmClear(false);
      void loadArchived(true, null);
    }
  }, [visible, loadArchived]);

  // 搜索词防抖（250ms）下推 SQL LIKE（标题/描述）
  useEffect(() => {
    if (!visible) return;
    if (term === dispatchedTermRef.current) return;
    const keyword = term;
    const timer = setTimeout(() => {
      dispatchedTermRef.current = keyword;
      void loadArchived(true, keyword);
    }, 250);
    return () => clearTimeout(timer);
  }, [term, visible, loadArchived]);

  // 状态过滤在客户端按行过滤（契约查询无此参数）
  const filtered = useMemo(() => {
    if (statusFilter === 'active') return archived.filter((t) => !t.completed);
    if (statusFilter === 'completed') return archived.filter((t) => t.completed);
    return archived;
  }, [archived, statusFilter]);

  const renderItem = ({ item }: { item: ArchivedTodoDto }) => (
    <View style={[styles.row, { backgroundColor: colors.bgTertiary }]}>
      <View style={styles.rowBody}>
        <Text
          numberOfLines={2}
          style={[
            styles.rowTitle,
            { color: colors.textPrimary },
            item.completed && {
              color: colors.textTertiary,
              textDecorationLine: 'line-through',
            },
          ]}
        >
          {item.title}
        </Text>
        <View style={styles.rowMeta}>
          <View style={[styles.dot, { backgroundColor: PRIORITY_DOT[item.priority] }]} />
          {item.projectName ? (
            <Text style={[styles.metaText, { color: colors.textTertiary }]} numberOfLines={1}>
              {item.projectName}
            </Text>
          ) : null}
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>
            {item.archivedAt.slice(0, 10)}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => void restoreArchivedTodo(item.id)}
        hitSlop={6}
        style={styles.rowAction}
      >
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>恢复</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          if (pendingPurgeId === item.id) {
            setPendingPurgeId(null);
            void purgeArchivedTodo(item.id);
          } else {
            setPendingPurgeId(item.id);
          }
        }}
        hitSlop={6}
        style={styles.rowAction}
      >
        <Text style={{ color: '#c0392b', fontSize: 13 }}>
          {pendingPurgeId === item.id ? '确认删除' : '删除'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>已归档事项</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: colors.accent, fontSize: 15 }}>关闭</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.bgTertiary, borderColor: colors.border },
          ]}
        >
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="搜索标题与描述"
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map(({ key, label }) => {
            const active = key === statusFilter;
            return (
              <Pressable key={key} onPress={() => setStatusFilter(key)} hitSlop={6}>
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
          {archived.length > 0 &&
            (confirmClear ? (
              <Pressable
                onPress={() => {
                  setConfirmClear(false);
                  void clearArchived();
                }}
                hitSlop={6}
              >
                <Text style={{ color: '#c0392b', fontSize: 13, fontWeight: '600' }}>
                  确认清空全部
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setConfirmClear(true)} hitSlop={6}>
                <Text style={{ color: '#c0392b', fontSize: 13 }}>清空全部</Text>
              </Pressable>
            ))}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          onEndReached={() => {
            if (!archivedExhausted) void loadArchived(false);
          }}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 48 }}>
              {term.trim() ? '没有匹配的归档' : '暂无已归档事项'}
            </Text>
          }
          ListFooterComponent={
            archived.length === 0 ? null : (
              <Text
                style={{
                  color: colors.textTertiary,
                  textAlign: 'center',
                  paddingVertical: 12,
                  fontSize: 12,
                }}
              >
                {archivedExhausted ? '没有更多了' : '上拉加载更多…'}
              </Text>
            )
          }
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  searchBox: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  searchInput: {
    paddingVertical: 10,
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowAction: {
    paddingLeft: 14,
  },
});
