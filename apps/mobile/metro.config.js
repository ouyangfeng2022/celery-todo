// Metro monorepo 配置。
//
// apps/mobile 独立于根 workspace（根 package.json 的 workspaces 不含它，
// 共享包经 file: 协议引用），Expo 对 monorepo 的自动探测不认这种布局：
// bun isolated linker 把 @celery/* 装成指向 packages/* 的软链，真实路径在
// 工程目录之外，Metro 默认只解析工程内的模块 → 打包报
// "Unable to resolve module @celery/core"。
// 按 Expo 官方 monorepo 配方手动挂 monorepo 根（Expo Go 开发与
// gradle createBundleReleaseJsAndAssets 都读这份配置）。
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 允许解析/监听工程目录之外的文件（packages/* 的真实源码）
config.watchFolders = [monorepoRoot];
// 双路 node_modules：mobile 自己的 + monorepo 根的（共享包的类型/运行时
// 依赖如 xlsx 从根解析）
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
// 跟随软链（bun isolated 布局）；@celery/* 只声明 exports 字段，需包级
// exports 解析。SDK 54 两者默认已开，显式声明防止上游默认值漂移。
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
