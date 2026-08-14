/**
 * 内存适配器 × Repository 契约测试。
 * Tauri / Expo 适配器完成后，各自包里用同样的方式挂载这套套件。
 */

import { describeRepositoryContracts } from '@celery/test-contracts';
import { createMemoryRepositories } from '../memory/memory-repositories';

describeRepositoryContracts('内存适配器', () => createMemoryRepositories());
