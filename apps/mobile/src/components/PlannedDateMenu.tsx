/**
 * @file 计划日期快捷菜单：今天 / 明天 / 下周一 / 自选日期 / 清除日期。
 * @description 取值与中文文案复用 @celery/core planning 纯函数，与桌面端时间视图同源；
 *              「自选日期」唤起系统日历（@react-native-community/datetimepicker，
 *              Expo Go 内置，无需额外原生配置）。
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { ThemeColors } from '@celery/ui-tokens';
import {
  addLocalDays,
  formatLocalDate,
  formatPlannedDate,
  nextMonday,
  type LocalDate,
} from '@celery/core';

interface PlannedDateMenuProps {
  /** 当前计划日期；非空时提供「清除日期」 */
  current: string | null;
  colors: ThemeColors;
  onPick: (date: LocalDate | null) => void;
}

/** "YYYY-MM-DD" → 本地 Date（避免 UTC 解析漂移，planning 内部同义函数未导出）。 */
function parseLocalDate(value: LocalDate): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function PlannedDateMenu({ current, colors, onPick }: PlannedDateMenuProps) {
  const [showPicker, setShowPicker] = useState(false);
  // 菜单生命周期极短（弹层内），打开时取一次「今天」即可
  const today = formatLocalDate(new Date());

  const quick: { key: string; label: string; value: LocalDate }[] = [
    { key: 'today', label: '今天', value: today },
    { key: 'tomorrow', label: '明天', value: addLocalDays(today, 1) },
    { key: 'nextMonday', label: '下周一', value: nextMonday(today) },
  ];

  const onPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowPicker(false);
    if (event.type === 'set' && date) onPick(formatLocalDate(date));
  };

  return (
    <View style={styles.wrap}>
      {quick.map((opt) => (
        <Pressable
          key={opt.key}
          onPress={() => onPick(opt.value)}
          style={[
            styles.chip,
            {
              borderColor: current === opt.value ? colors.accent : colors.border,
              backgroundColor: current === opt.value ? colors.accent : 'transparent',
            },
          ]}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: current === opt.value ? '600' : '400',
              color: current === opt.value ? '#ffffff' : colors.textPrimary,
            }}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => setShowPicker(true)}
        style={[styles.chip, { borderColor: colors.border }]}
      >
        <Text style={{ fontSize: 13, color: colors.textPrimary }}>自选日期</Text>
      </Pressable>
      {current !== null && (
        <Pressable
          onPress={() => onPick(null)}
          style={[styles.chip, { borderColor: colors.border }]}
        >
          <Text style={{ fontSize: 13, color: '#c0392b' }}>清除日期</Text>
        </Pressable>
      )}
      {current !== null && (
        <Text style={[styles.current, { color: colors.textTertiary }]}>
          当前：{formatPlannedDate(current)}
        </Text>
      )}

      {/* Android 日历对话框；取消（type !== 'set'）不改动 */}
      {showPicker && (
        <DateTimePicker
          value={current ? parseLocalDate(current) : new Date()}
          mode="date"
          display="calendar"
          onChange={onPickerChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  current: {
    fontSize: 12,
  },
});
