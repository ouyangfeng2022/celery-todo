/**
 * @file 首启 2.x 数据导入横幅
 * @description 仅在 v3 库为空且探测到 2.x 数据时出现（见 useAppBootstrap）。
 *              导入在 Rust 侧单事务完成（源库只读 ATTACH，失败整体回滚可重试）。
 */

import { motion } from 'framer-motion';
import type { LegacyV2Report } from '@celery/data';
import { Logo } from '../components/common/Logo';

interface MigrationOfferProps {
  report: LegacyV2Report;
  importing: boolean;
  error: string | null;
  onImport: () => void;
  onSkip: () => void;
}

export function MigrationOffer({
  report,
  importing,
  error,
  onImport,
  onSkip,
}: MigrationOfferProps) {
  const counts = report.counts;
  return (
    <div
      className="flex h-full items-center justify-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl px-8"
      >
        <div className="mb-8 flex justify-center">
          <Logo variant="full" size={128} />
        </div>
        <h1
          className="mb-2 text-center text-claude-lg font-serif font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          发现 Celery Todo 2.x 数据
        </h1>
        <p className="mb-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
          3.0 · 首次启动
        </p>
        {report.supported ? (
          <>
            <p
              className="mb-4 text-center text-claude-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              将导入 {counts?.projects ?? 0} 个项目、{counts?.todos ?? 0} 条事项、
              {counts?.archivedTodos ?? 0} 条归档记录。源库只读，不会修改。
            </p>
            {report.warnings.length > 0 && (
              <ul
                className="mb-4 list-disc rounded-claude px-5 py-3 text-xs"
                style={{
                  color: 'var(--text-tertiary)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-center gap-3">
              <button
                type="button"
                className="rounded-claude px-5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)' }}
                disabled={importing}
                onClick={onImport}
              >
                {importing ? '导入中…' : '导入 2.x 数据'}
              </button>
              <button
                type="button"
                className="rounded-claude px-5 py-2 text-sm transition-colors"
                style={{
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                }}
                onClick={onSkip}
              >
                跳过，创建全新数据库
              </button>
            </div>
          </>
        ) : (
          <>
            <p
              className="mb-6 text-center text-claude-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {report.blocker}
            </p>
            <div className="flex justify-center">
              <button
                type="button"
                className="rounded-claude px-5 py-2 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: 'var(--accent)' }}
                onClick={onSkip}
              >
                跳过，创建全新数据库
              </button>
            </div>
          </>
        )}
        {error && (
          <p className="mt-4 text-center text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
      </motion.div>
    </div>
  );
}
