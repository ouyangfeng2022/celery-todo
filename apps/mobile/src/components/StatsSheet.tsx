/**
 * @file 统计面板：指标卡 / GitHub 风格热力图 / 优先级与项目分布。
 * @description 计算全部复用 @celery/core stats 纯函数（与桌面统计页同源），
 *              图表用纯 View 自绘（对齐桌面 div+CSS 零图表库思路）。
 *              统计口径：活跃 + 已归档合并——完成即归档的用法下只看活跃会
 *              严重失真（归档行字段与 TodoDto 同构，直接并入）。
 */

import { useEffect, useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  buildHeatmap,
  computeStreaks,
  groupByPriority,
  groupByProject,
  summarize,
} from '@celery/core';
import { useAppData } from '../state/AppData';
import { palette, PRIORITY_DOT, PRIORITY_LABELS } from '../theme';
import { toCoreProject, toCoreTodo } from '../utils/coreAdapter';

/** 热力图档位透明度（0 = 无活动底色，用 bgHover 表达）。 */
const LEVEL_OPACITY = [1, 0.3, 0.5, 0.75, 1];
const HEATMAP_WEEKS = 26;

interface StatsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function StatsSheet({ visible, onClose }: StatsSheetProps) {
  const { theme, allTodos, refreshAllTodos, archived, loadAllArchived, projects } = useAppData();
  const colors = palette(theme);

  // 打开时刷新数据（活跃 + 归档全量抽干）
  useEffect(() => {
    if (visible) {
      void Promise.all([loadAllArchived(), refreshAllTodos()]);
    }
  }, [visible, loadAllArchived, refreshAllTodos]);

  const coreTodos = useMemo(() => {
    const merged = [...allTodos, ...archived];
    return merged.map(toCoreTodo);
  }, [allTodos, archived]);

  const summary = useMemo(() => summarize(coreTodos), [coreTodos]);
  const cells = useMemo(() => buildHeatmap(coreTodos, 'completedAt', HEATMAP_WEEKS), [coreTodos]);
  const streaks = useMemo(() => computeStreaks(cells), [cells]);
  const prioritySlices = useMemo(() => groupByPriority(coreTodos), [coreTodos]);
  const projectStats = useMemo(
    () => groupByProject(coreTodos, projects.map(toCoreProject)).slice(0, 6),
    [coreTodos, projects],
  );

  const metricCards: { label: string; value: number }[] = [
    { label: '今日完成', value: summary.todayCompleted },
    { label: '本周完成', value: summary.weekCompleted },
    { label: '连续天数', value: streaks.current },
    { label: '累计完成', value: summary.completed },
  ];

  const prioTotal = prioritySlices.reduce((n, s) => n + s.count, 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>统计</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: colors.accent, fontSize: 15 }}>关闭</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            含已归档事项 · 共 {summary.total} 条 · 完成率 {summary.completionRate}%
          </Text>

          {/* 指标卡 2×2 */}
          <View style={styles.metricGrid}>
            {metricCards.map(({ label, value }) => (
              <View
                key={label}
                style={[
                  styles.metricCard,
                  { backgroundColor: colors.bgTertiary, borderColor: colors.border },
                ]}
              >
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>{label}</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '700' }}>
                  {value}
                </Text>
              </View>
            ))}
          </View>

          {/* 热力图（按完成日，26 周） */}
          <Text style={[styles.section, { color: colors.textPrimary }]}>完成热力图</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {Array.from({ length: HEATMAP_WEEKS }, (_, w) => (
                <View key={w} style={{ flexDirection: 'column', gap: 3 }}>
                  {Array.from({ length: 7 }, (_, d) => {
                    const cell = cells[w * 7 + d];
                    return (
                      <View
                        key={d}
                        style={[
                          styles.cell,
                          {
                            backgroundColor:
                              cell && cell.count > 0 ? colors.accent : colors.bgHover,
                            opacity: cell ? LEVEL_OPACITY[cell.level] : 1,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={styles.legendRow}>
            <Text style={{ color: colors.textTertiary, fontSize: 11 }}>少</Text>
            {[1, 2, 3, 4].map((level) => (
              <View
                key={level}
                style={[
                  styles.cell,
                  { backgroundColor: colors.accent, opacity: LEVEL_OPACITY[level] },
                ]}
              />
            ))}
            <Text style={{ color: colors.textTertiary, fontSize: 11 }}>多</Text>
          </View>

          {/* 优先级分布 */}
          <Text style={[styles.section, { color: colors.textPrimary }]}>优先级分布</Text>
          {prioTotal > 0 ? (
            <View
              style={[
                styles.stackedBar,
                { backgroundColor: colors.bgHover, borderColor: colors.border },
              ]}
            >
              {prioritySlices.map((s) =>
                s.count > 0 ? (
                  <View
                    key={s.priority}
                    style={{
                      flex: s.count / prioTotal,
                      backgroundColor: PRIORITY_DOT[s.priority],
                    }}
                  />
                ) : null,
              )}
            </View>
          ) : null}
          <View style={styles.legendRow}>
            {prioritySlices.map((s) => (
              <View key={s.priority} style={[styles.legendItem, { gap: 12 }]}>
                <View style={[styles.dot, { backgroundColor: PRIORITY_DOT[s.priority] }]} />
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {PRIORITY_LABELS[s.priority]} {s.count}
                </Text>
              </View>
            ))}
          </View>

          {/* 项目完成率（前 6） */}
          <Text style={[styles.section, { color: colors.textPrimary }]}>项目完成率</Text>
          {projectStats.length === 0 && (
            <Text style={{ color: colors.textTertiary, fontSize: 13 }}>暂无数据</Text>
          )}
          {projectStats.map((s) => (
            <View key={s.project.id} style={styles.projectRow}>
              <View style={styles.projectRowHead}>
                <Text style={{ color: colors.textPrimary, fontSize: 13 }} numberOfLines={1}>
                  {s.project.name}
                </Text>
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                  {s.completed}/{s.total} · {s.rate}%
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.bgHover }]}>
                <View
                  style={{
                    width: `${s.rate}%`,
                    height: '100%',
                    backgroundColor: colors.accent,
                    borderRadius: 3,
                  }}
                />
              </View>
            </View>
          ))}
        </ScrollView>
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
  hint: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 12,
  },
  metricCard: {
    width: '47%',
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  section: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 8,
  },
  cell: {
    width: 11,
    height: 11,
    borderRadius: 2.5,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  projectRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 6,
  },
  projectRowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
});
