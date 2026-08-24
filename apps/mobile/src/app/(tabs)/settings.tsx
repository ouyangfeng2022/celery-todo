/**
 * @file 设置页：主题（纸白/暗色/芹绿，@celery/ui-tokens 三色板）+ 数据（归档/备份）+ 关于。
 */

import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { parseV3Export, serializeV3Export, type ParsedV3Export } from '@celery/data';
import { useAppData } from '../../state/AppData';
import { palette, THEME_LABELS, type ThemeName } from '../../theme';
import { ArchiveHistorySheet } from '../../components/ArchiveHistorySheet';

const THEME_KEYS: ThemeName[] = ['light', 'dark', 'celery'];

export default function SettingsScreen() {
  const { theme, setTheme, buildV3Export, importBackup } = useAppData();
  const colors = palette(theme);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const exportBackup = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await buildV3Export();
      const d = new Date();
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const uri = `${FileSystem.cacheDirectory ?? ''}Celery-Todo-All-${ymd}.json`;
      await FileSystem.writeAsStringAsync(uri, serializeV3Export(file), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: '导出备份' });
    } catch (e) {
      Alert.alert('导出失败', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pickAndImportBackup = async () => {
    if (busy) return;
    // Android 上 .json 的 MIME 常见 application/json / octet-stream / text/plain，都放行
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/octet-stream', 'text/plain'],
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    let parsed: ParsedV3Export;
    try {
      const raw = await FileSystem.readAsStringAsync(picked.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      parsed = parseV3Export(raw);
    } catch {
      Alert.alert('导入失败', '无法读取所选文件');
      return;
    }
    if (!parsed.ok || !parsed.data) {
      Alert.alert('导入失败', parsed.reason ?? '文件格式不受支持');
      return;
    }
    const file = parsed.data;
    Alert.alert(
      '导入备份',
      `将覆盖本机全部数据：项目 ${file.projects.length} 个 / 事项 ${file.todos.length} 条 / 归档 ${file.archivedTodos.length} 条。\n此操作不可撤销，建议先导出一份当前数据。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '覆盖导入',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            importBackup(file)
              .then(() => Alert.alert('导入完成', '本机数据已替换为备份内容'))
              .catch((e: unknown) =>
                Alert.alert('导入失败', e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

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
        <Pressable
          onPress={() => void exportBackup()}
          disabled={busy}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? colors.bgHover : colors.bgTertiary,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 15, flex: 1 }}>导出备份</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 13 }}>
            {busy ? '处理中…' : 'JSON · 分享保存'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void pickAndImportBackup()}
          disabled={busy}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? colors.bgHover : colors.bgTertiary,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 15, flex: 1 }}>导入备份</Text>
          <Text style={{ color: colors.textTertiary, fontSize: 13 }}>JSON · 覆盖本机</Text>
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
