/**
 * @file 项目面板：新建项目（可从模板）/ 重命名 + 删除 / 保存为模板（长按项目 chip 弹出）。
 * @description 与 TodoActionsSheet 同样的 RN Modal 底部面板，不引入额外 UI 依赖。
 *              收集箱等系统项目只可重命名，不提供删除与存模板。
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

export interface TemplateOption {
  id: string;
  name: string;
  count: number;
}

interface ProjectSheetProps {
  /** null = 关闭；无 target = 新建模式 */
  target: ProjectSheetTarget | null;
  visible: boolean;
  colors: ThemeColors;
  /** 模板列表（新建模式展示「从模板新建」） */
  templates: TemplateOption[];
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** 用模板新建项目（面板自行关闭） */
  onUseTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
  /** 项目存为模板（同名替换）；错误由调用方 Alert */
  onSaveTemplate: (id: string, name: string) => Promise<void>;
}

export function ProjectSheet({
  target,
  visible,
  colors,
  templates,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onUseTemplate,
  onDeleteTemplate,
  onSaveTemplate,
}: ProjectSheetProps) {
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // 每次打开重置草稿与删除确认态
  useEffect(() => {
    if (visible) {
      setDraft(target?.name ?? '');
      setConfirmDelete(false);
      setTemplateName(target?.name ?? '');
      setSavingTemplate(false);
    }
  }, [visible, target]);

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    if (target) onRename(target.id, name);
    else onCreate(name);
  };

  const submitTemplate = async () => {
    if (!target || !templateName.trim() || savingTemplate) return;
    setSavingTemplate(true);
    try {
      await onSaveTemplate(target.id, templateName);
    } finally {
      setSavingTemplate(false);
    }
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

            {/* 新建模式：从模板新建（模板存在才显示） */}
            {!target && templates.length > 0 && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Text style={[styles.section, { color: colors.textTertiary }]}>从模板新建</Text>
                {templates.map((t) => (
                  <View key={t.id} style={styles.templateRow}>
                    <Pressable
                      onPress={() => onUseTemplate(t.id)}
                      style={({ pressed }) => [
                        styles.templateMain,
                        { backgroundColor: pressed ? colors.bgHover : 'transparent' },
                      ]}
                    >
                      <Text
                        style={{ color: colors.textPrimary, fontSize: 15, flex: 1 }}
                        numberOfLines={1}
                      >
                        {t.name}
                      </Text>
                      <Text style={{ color: colors.textTertiary, fontSize: 12 }}>{t.count} 项</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onDeleteTemplate(t.id)}
                      hitSlop={6}
                      style={styles.templateDel}
                    >
                      <Text style={{ color: colors.textTertiary, fontSize: 13 }}>删除</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            {/* 管理模式（user 项目）：保存为模板（收集箱不可存，与桌面端一致） */}
            {target && target.kind === 'user' && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Text style={[styles.section, { color: colors.textTertiary }]}>保存为模板</Text>
                <TextInput
                  value={templateName}
                  onChangeText={setTemplateName}
                  placeholder="模板名称"
                  placeholderTextColor={colors.textTertiary}
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
                    onPress={() => void submitTemplate()}
                    disabled={!templateName.trim() || savingTemplate}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      {
                        backgroundColor: colors.accent,
                        opacity: !templateName.trim() || savingTemplate || pressed ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>
                      {savingTemplate ? '保存中…' : '存为模板（未完成事项）'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

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
  section: {
    fontSize: 12,
    paddingBottom: 6,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
  },
  templateMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  templateDel: {
    paddingHorizontal: 12,
    paddingVertical: 12,
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
