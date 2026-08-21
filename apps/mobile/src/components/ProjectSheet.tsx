/**
 * @file 项目面板：新建项目 / 重命名 + 删除（长按项目 chip 弹出）。
 * @description 与 TodoActionsSheet 同样的 RN Modal 底部面板，不引入额外 UI 依赖。
 *              收集箱等系统项目只可重命名，不提供删除。
 */

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ThemeColors } from '@celery/ui-tokens';

export interface ProjectSheetTarget {
  id: string;
  name: string;
  kind: 'user' | 'inbox' | 'weekly';
}

interface ProjectSheetProps {
  /** null = 关闭；无 target = 新建模式 */
  target: ProjectSheetTarget | null;
  visible: boolean;
  colors: ThemeColors;
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectSheet({
  target,
  visible,
  colors,
  onClose,
  onCreate,
  onRename,
  onDelete,
}: ProjectSheetProps) {
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 每次打开重置草稿与删除确认态
  useEffect(() => {
    if (visible) {
      setDraft(target?.name ?? '');
      setConfirmDelete(false);
    }
  }, [visible, target]);

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    if (target) onRename(target.id, name);
    else onCreate(name);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Android 15 edge-to-edge 下 Modal 弹层的 adjustResize 不生效，软键盘会直接
            盖住底部按钮；KAV 按键盘与面板的实际重叠量抬升，adjustResize 有效的设备
            上重叠为 0、不会双重上移 */}
        <KeyboardAvoidingView behavior="padding">
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.bgTertiary }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {target ? '管理项目' : '新建项目'}
            </Text>

            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              returnKeyType="done"
              placeholder="项目名称"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              style={[
                styles.input,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.bgPrimary,
                  borderColor: colors.border,
                },
              ]}
            />

            <View style={styles.actions}>
              <Pressable
                onPress={submit}
                disabled={!draft.trim()}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.accent, opacity: !draft.trim() || pressed ? 0.5 : 1 },
                ]}
              >
                <Text style={styles.primaryBtnText}>{target ? '保存' : '创建'}</Text>
              </Pressable>
            </View>

            {target && target.kind === 'user' && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                {confirmDelete ? (
                  <View style={styles.deleteConfirm}>
                    <Text style={[styles.deleteHint, { color: colors.textTertiary }]}>
                      删除后项目内未完成事项将移入归档，确认删除？
                    </Text>
                    <View style={styles.actions}>
                      <Pressable
                        onPress={() => onDelete(target.id)}
                        style={[styles.dangerBtn, { backgroundColor: '#c0392b' }]}
                      >
                        <Text style={styles.primaryBtnText}>确认删除</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmDelete(false)}
                        style={({ pressed }) => [
                          styles.ghostBtn,
                          { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                        ]}
                      >
                        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>取消</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setConfirmDelete(true)}
                    style={({ pressed }) => [
                      styles.deleteRow,
                      { backgroundColor: pressed ? colors.bgHover : 'transparent' },
                    ]}
                  >
                    <Text style={{ color: '#c0392b', fontSize: 15 }}>删除项目</Text>
                  </Pressable>
                )}
              </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 32,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  primaryBtn: {
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  ghostBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 11,
    justifyContent: 'center',
  },
  dangerBtn: {
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    marginVertical: 10,
  },
  deleteRow: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  deleteConfirm: {
    borderRadius: 8,
  },
  deleteHint: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
    paddingTop: 6,
  },
});
