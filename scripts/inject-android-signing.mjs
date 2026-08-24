#!/usr/bin/env node
/**
 * 注入 Android release 固定签名（作用于 expo prebuild 生成的 apps/mobile/android/）。
 *
 * 背景：Expo 模板的 release 构建默认用 runner 上临时生成的 debug keystore 签名，
 * 相邻两次构建证书不同 → 侧载用户无法原地升级（INSTALL_FAILED_UPDATE_INCOMPATIBLE，
 * 只能卸载重装 = 本机数据全丢）。本脚本把专用上传证书的签名配置写进
 * android/app/build.gradle；keystore 本体以 base64 存 GitHub Actions secrets：
 *
 *   ANDROID_KEYSTORE_BASE64      keystore 文件（PKCS12）
 *   ANDROID_KEYSTORE_PASSWORD    store 口令
 *   ANDROID_KEY_PASSWORD         key 口令（与 store 同值）
 *
 * 约定：keystore 由 workflow 解码到 apps/mobile/android/app/celery-upload.keystore
 * （本脚本只写配置、不生成文件）。口令直接写进 build.gradle —— runner 是一次性
 * 环境，无泄漏面；本地手工构建不跑本脚本，保持模板默认的 debug 签名。
 *
 * 缺任一口令环境变量立即失败 —— CI 绝不静默回退 debug 签名。
 * 模板锚点（signingConfigs debug 块 / release 块的 Caution 注释）不匹配时同样
 * 失败并提示，防止 Expo 模板升级后静默漏注入。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const GRADLE_PATH = 'apps/mobile/android/app/build.gradle';
const KEYSTORE_FILE = 'celery-upload.keystore'; // 相对 android/app/ 目录
const KEY_ALIAS = 'celery-todo';

const storePass = process.env.ANDROID_KEYSTORE_PASSWORD;
const keyPass = process.env.ANDROID_KEY_PASSWORD;
if (!storePass || !keyPass) {
  fail('缺少 ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD 环境变量');
}

let src = readFileSync(GRADLE_PATH, 'utf8');
if (src.includes(KEYSTORE_FILE)) {
  console.log('inject-android-signing: 已注入过，跳过');
  process.exit(0);
}

// 1) signingConfigs 块内、debug 之前追加 release 配置
const signingAnchor = '    signingConfigs {\n        debug {';
if (!src.includes(signingAnchor)) {
  fail('未找到 signingConfigs debug 块锚点（Expo 模板结构变化？）');
}
const signingPatched = `    signingConfigs {
        release {
            storeFile file('${KEYSTORE_FILE}')
            storePassword '${groovyEscape(storePass)}'
            keyAlias '${KEY_ALIAS}'
            keyPassword '${groovyEscape(keyPass)}'
        }
        debug {`;
src = src.replace(signingAnchor, signingPatched);

// 2) release buildType 改用该配置。以 Caution 注释定位（debug buildType 里有同名
//    signingConfig 行，不能盲替换）
const releaseAnchor = [
  '            // Caution! In production, you need to generate your own keystore file.',
  '            // see https://reactnative.dev/docs/signed-apk-android.',
  '            signingConfig signingConfigs.debug',
].join('\n');
if (!src.includes(releaseAnchor)) {
  fail('未找到 release buildType 的签名行锚点（Expo 模板结构变化？）');
}
src = src.replace(
  releaseAnchor,
  '            // 上传签名由 scripts/inject-android-signing.mjs 注入\n            signingConfig signingConfigs.release',
);

writeFileSync(GRADLE_PATH, src);
console.log('inject-android-signing: 已注入 release 签名配置');

function fail(msg) {
  console.error(`inject-android-signing: ${msg}`);
  process.exit(1);
}

/** Groovy 单引号字符串转义（口令为 hex，正常不会命中，防御性处理）。 */
function groovyEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
