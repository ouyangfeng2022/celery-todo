/**
 * @file 长按操作菜单：置顶 / 优先级 / 计划日期 / 移动项目 / 归档。
 * @description 用 RN Modal 实现（底部弹出面板），不引入额外 UI 依赖。
 */

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '@celery/ui-tokens';
import type { TodoDto, TodoPriority } from '@celery/data';
import { PRIORITY_DOT, PRIORITY_LABELS } from '../theme';
import { PlannedDateMenu } from './PlannedDateMenu';

interface ProjectOption {
  id: string;
  name: string;
}

interface TodoActionsSheetProps {
  todo: TodoDto | null;
  projects: ProjectOption[];
  colors: ThemeColors;
  onClose: () => void;
  onPin: (pinned: boolean) => void;
  onSetPriority: (priority: TodoPriority) => void;
  onSetPlannedDate: (date: string | null) => void;
  onMove: (projectId: string) => void;
  onArchive: () => void;
}

export function TodoActionsSheet({
  todo,
  projects,
  colors,
  onClose,
  onPin,
  onSetPriority,
  onSetPlannedDate,
  onMove,
  onArchive,
}: TodoActionsSheetProps) {
  return (
    <Modal visible={todo !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.bgTertiary }]}
          onPress={(e) => e.stopPropagation()}
        >
          {todo && (
            <>
              <Text numberOfLines={1} style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                {todo.title}
              </Text>

              <SheetRow label={todo.pinned ? '取消置顶' : '置顶'} colors={colors} onPress={() => onPin(!todo.pinned)} />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Text style={[styles.section, { color: colors.textTertiary }]}>优先级</Text>
              {(['high', 'medium', 'low'] as const).map((p) => (
                <SheetRow
                  key={p}
                  label={`${PRIORITY_LABELS[p]}优先级`}
                  dot={PRIORITY_DOT[p]}
                  active={todo.priority === p}
                  colors={colors}
                  onPress={() => onSetPriority(p)}
                />
              ))}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Text style={[styles.section, { color: colors.textTertiary }]}>计划日期</Text>
              <PlannedDateMenu
                current={todo.plannedDate ?? null}
                colors={colors}
                onPick={onSetPlannedDate}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Text style={[styles.section, { color: colors.textTertiary }]}>移动到项目</Text>
              {projects
                .filter((p) => p.id !== todo.projectId)
                .map((p) => (
                  <SheetRow key={p.id} label={p.name} colors={colors} onPress={() => onMove(p.id)} />
                ))}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <SheetRow label="归档（移入历史记录）" colors={colors} danger onPress={onArchive} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetRow({
  label,
  colors,
  onPress,
  dot,
  active,
  danger,
}: {
  label: string;
  colors: ThemeColors;
  onPress: () => void;
  dot?: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.bgHover : 'transparent' },
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <Text
        style={[
          styles.rowText,
          { color: danger ? '#c0392b' : colors.textPrimary },
          active && { fontWeight: '700' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 12,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  section: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  rowText: {
    fontSize: 15,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    marginVertical: 6,
  },
});
