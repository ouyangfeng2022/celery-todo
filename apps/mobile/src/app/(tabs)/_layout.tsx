/**
 * @file 四入口 Tab 布局：事项 / 计划 / 搜索 / 设置。
 */

import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppData } from '../../state/AppData';
import { palette } from '../../theme';

function TabIcon({ glyph, focused, color }: { glyph: string; focused: boolean; color: string }) {
  return (
    <Text style={{ fontSize: 18, color, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  const { theme } = useAppData();
  const colors = palette(theme);
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top']}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: {
            backgroundColor: colors.bgTertiary,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom - 8, 4),
          },
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: '事项',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon glyph="☑" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: '计划',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon glyph="▤" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: '搜索',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon glyph="⌕" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: '设置',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon glyph="⚙" focused={focused} color={color} />
            ),
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}
