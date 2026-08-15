/**
 * @file 2.x 旧库导入服务契约（LegacyV2ImportService）
 * @description 3.0 与 2.x 的唯一兼容入口，仅桌面端提供（移动端无 2.x 数据）。
 *              流程遵循 3.0 计划第 6 步：
 *              仅首次启动、目标空库时展示；inspect 展示摘要；确认后单事务导入；
 *              跳过即创建全新 v3 数据库。
 */

import type { LegacyV2ImportResult, LegacyV2Report } from './generated';

export type { LegacyV2ImportResult, LegacyV2Report, LegacyV2Counts } from './generated';

export interface LegacyV2ImportService {
  /**
   * 检查一个 2.x 数据库文件。
   * 永不抛错：所有问题（版本不支持、损坏、孤儿数据）都体现在返回的报告中。
   * path 为空时自动探测 2.x 默认目录与 storage-config.json 指向的自定义目录。
   */
  inspect(path?: string | null): Promise<LegacyV2Report>;

  /**
   * 把 2.x 源库事务性导入到当前 v3 库。
   * 前置条件：目标库为空（首次启动）；源库只读；失败整体回滚、可重试。
   */
  importFrom(sourcePath: string): Promise<LegacyV2ImportResult>;

  /**
   * 自动探测 2.x 数据库文件路径（默认目录 + 自定义存储位置）。
   * 找不到返回 null —— 向导据此只展示手动选文件入口。
   */
  detectSource(): Promise<string | null>;
}
