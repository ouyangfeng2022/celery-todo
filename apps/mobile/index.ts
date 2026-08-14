/** Expo 入口（未启用 expo-router 前的直挂入口；路由里程碑切换到 app/ 目录）。 */
import { registerRootComponent } from 'expo';
import App from './src/App';

registerRootComponent(App);
