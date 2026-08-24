/**
 * @file 设置页：主题（纸白/暗色/芹绿，@celery/ui-tokens 三色板）+ 已归档事项 + 关于。
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../../state/AppData';
import { palette, THEME_LABELS, type ThemeName } from '../../theme';
import { ArchiveHistorySheet } from '../../components/ArchiveHistorySheet';

const THEME_KEYS: ThemeName[] = ['light', 'dark', 'celery'];

export default function SettingsScreen() {
  const { theme, setTheme } = useAppData();
  const colors = palette(theme);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <Text style={[styles.header, { color: colors.textPrimary }]}>设置</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={[styles.section, { color: colors.textTertiary }]}>主题</Text>
        {THEME_KEYS.map((key) => {
          const active = key === theme;
          return (
            <Pressable
              key={key}
              onPress={() => setTheme(key)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? colors.bgHover : colors.bgTertiary,
                  borderColor: active ? colors.accent : colors.border,
                },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: palette(key).accent }]} />
              <Text style={{ color: colors.textPrimary, fontSize: 15, flex: 1 }}>
                {THEME_LABELS[key]}
              </Text>
              {active && <Text style={{ color: colors.accent, fontSize: 13 }}>当前</Text>}
            </Pressable>
          );
        })}

        <Text style={[styles.section, { color: colors.textTertiary }]}>数据</Text>
        <Pressable
          onPress={() => setArchiveOpen(true)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? colors.bgHover : colors.bgTertiary,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 15, flex: 1 }}>已归档事项</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 13 }}>查看 / 恢复</Text>
        </Pressable>

        <Text style={[styles.section, { color: colors.textTertiary }]}>关于</Text>
        <View
          style={[styles.card, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 22 }}>
            Celery Todo 3.0 移动端{'\n'}
            数据保存在本机（SQLite），与桌面端互不相通；无云同步。
          </Text>
        </View>
      </ScrollView>

      <ArchiveHistorySheet visible={archiveOpen} onClose={() => setArchiveOpen(false)} />
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
  section: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginVertical: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  card: {
    marginHorizontal: 12,
    marginTop: 4,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
});
