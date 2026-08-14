/**
 * @file 事项行：右滑完成、左滑归档、长按弹出操作菜单。
 */

import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import type { ThemeColors } from '@celery/ui-tokens';
import type { TodoDto, TodoPriority } from '@celery/data';
import { PRIORITY_DOT } from '../theme';

export interface TodoRowAction {
  pin: (pinned: boolean) => void;
  setPriority: (priority: TodoPriority) => void;
  move: (projectId: string) => void;
  archive: () => void;
}

interface TodoRowProps {
  todo: TodoDto;
  colors: ThemeColors;
  onToggle: () => void;
  onArchive: () => void;
  onLongPress: () => void;
  /** 拖拽排序模式下行内容左侧的把手 */
  dragHandle?: React.ReactNode;
}

export function TodoRow({
  todo,
  colors,
  onToggle,
  onArchive,
  onLongPress,
  dragHandle,
}: TodoRowProps) {
  const swipeableRef = useRef<Swipeable>(null);

  // renderRightActions 是「右滑后左侧露出」的面板（完成），反之亦然
  const renderRightActions = () => (
    <View style={[styles.action, { backgroundColor: '#788c5d' }]}>
      <Text style={styles.actionText}>{todo.completed ? '恢复' : '完成'}</Text>
    </View>
  );

  const renderLeftActions = () => (
    <View style={[styles.action, { backgroundColor: '#c0392b' }]}>
      <Text style={styles.actionText}>归档</Text>
    </View>
  );

  return (
    <GestureHandlerRootView>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}
        overshootRight={false}
        overshootLeft={false}
        onSwipeableOpen={(direction: 'left' | 'right') => {
          // 左滑露出右侧「归档」/ 右滑露出左侧「完成」，到位即执行并收起
          if (direction === 'left') onArchive();
          else onToggle();
          swipeableRef.current?.close();
        }}
      >
        <Pressable
          onPress={onToggle}
          onLongPress={onLongPress}
          style={[styles.row, { backgroundColor: todo.pinned ? colors.pinnedBg : colors.bgTertiary }]}
        >
          {dragHandle}
          <View
            style={[
              styles.checkbox,
              {
                borderColor: todo.completed ? colors.accent : colors.borderStrong,
                backgroundColor: todo.completed ? colors.accent : 'transparent',
              },
            ]}
          />
          <View style={styles.body}>
            <Text
              numberOfLines={2}
              style={[
                styles.title,
                { color: colors.textPrimary },
                todo.completed && { color: colors.textTertiary, textDecorationLine: 'line-through' },
              ]}
            >
              {todo.title}
            </Text>
            <View style={styles.meta}>
              <View style={[styles.priorityDot, { backgroundColor: PRIORITY_DOT[todo.priority] }]} />
              {todo.plannedDate ? (
                <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                  {todo.plannedDate.slice(5)}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Swipeable>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginHorizontal: 12,
    marginVertical: 3,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    marginRight: 12,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  action: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 76,
    borderRadius: 10,
    marginVertical: 3,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
