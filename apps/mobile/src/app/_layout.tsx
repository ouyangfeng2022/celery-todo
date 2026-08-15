/**
 * @file 根布局：手势根视图 + 数据 Provider + 根 Stack。
 */

import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppDataProvider } from '../state/AppData';
import { useAppData } from '../state/AppData';
import { palette } from '../theme';
import { useColorScheme } from 'react-native';

function ThemedStack() {
  const { theme } = useAppData();
  const systemScheme = useColorScheme();
  // celery 主题固定浅色状态栏；light/dark 跟随主题
  const style = theme === 'dark' || (theme === 'light' && systemScheme === 'dark') ? 'light' : 'dark';
  const colors = palette(theme);
  return (
    <>
      <StatusBar style={style} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgPrimary },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppDataProvider>
          <ThemedStack />
        </AppDataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
