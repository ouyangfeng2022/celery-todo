/**
 * @file 事项详情编辑面板：标题 + 描述（纯文本）。
 * @description 打开时以当前值初始化，关闭时一次性回传草稿由父层保存
 *              （桌面端为 600ms 防抖自动保存 + 保存指示，移动端刻意从简）。
 *              描述按纯文本处理，不引入 Markdown 渲染。
 */

import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import type { ThemeColors } from '@celery/ui-tokens';
import type { TodoDto } from '@celery/data';

export interface TodoContentDraft {
  title: string;
  description: string;
}

interface TodoDetailSheetProps {
  todo: TodoDto | null;
  colors: ThemeColors;
  /** 关闭（含 Android 返回键）时回传当前草稿；标题清空由数据层忽略标题改动 */
  onClose: (draft: TodoContentDraft) => void;
}

export function TodoDetailSheet({ todo, colors, onClose }: TodoDetailSheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // 每次打开以事项当前值重置草稿
  useEffect(() => {
    if (todo) {
      setTitle(todo.title);
      setDescription(todo.description ?? '');
    }
  }, [todo]);

  const close = () => onClose({ title, description });

  const inputStyle = {
    color: colors.textPrimary,
    backgroundColor: colors.bgPrimary,
    borderColor: colors.border,
  };

  return (
    <Modal visible={todo !== null} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        {/* Android 15 edge-to-edge 下软键盘会盖住底部按钮，KAV 按重叠量抬升（同 ProjectSheet） */}
        <KeyboardAvoidingView behavior="padding">
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.bgTertiary }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>编辑事项</Text>

            <Text style={[styles.label, { color: colors.textTertiary }]}>标题</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              multiline
              placeholder="标题"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, styles.titleInput, inputStyle]}
            />

            <Text style={[styles.label, { color: colors.textTertiary }]}>描述</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="添加描述"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, styles.descInput, inputStyle]}
            />

            <Pressable
              onPress={close}
              style={({ pressed }) => [
                styles.doneBtn,
                { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.doneBtnText}>完成</Text>
            </Pressable>
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
  label: {
    fontSize: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  titleInput: {
    fontWeight: '500',
  },
  descInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  doneBtn: {
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 11,
    marginTop: 14,
    alignSelf: 'flex-end',
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
