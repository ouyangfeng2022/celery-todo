/**
 * @file 全局事项搜索
 * @description 当前项目 store 只缓存已打开项目；搜索走服务端（FTS5 / LIKE），
 *              跨项目结果带项目名与命中片段摘要。
 */

import { useCallback, useEffect, useState } from 'react';
import type { GlobalSearchResult, Project, Todo } from '../types';
import * as data from '../utils/dataGateway';

/**
 * 生成全局搜索结果摘要：描述命中时截取关键词周边片段；描述未命中但有内容时
 * 展示描述作为上下文；无描述时返回空串，由 SearchBar 隐藏该行。
 */
function extractMatchedText(todo: Todo, lowerKeyword: string): string {
  const description = todo.description?.trim();
  if (!description) return '';
  const descLower = description.toLowerCase();
  const idx = descLower.indexOf(lowerKeyword);
  if (idx === -1) return description;
  const start = Math.max(0, idx - 12);
  const end = Math.min(description.length, idx + lowerKeyword.length + 12);
  const snippet = description.slice(start, end);
  return start > 0 ? `…${snippet}` : snippet;
}

interface UseGlobalSearchOptions {
  dbReady: boolean;
  projects: Project[];
  /** 数据库内容变动信号（todos / 归档引用变化时重查） */
  revision: number;
}

export function useGlobalSearch({ dbReady, projects, revision }: UseGlobalSearchOptions) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);

  useEffect(() => {
    const term = keyword.trim();
    if (!dbReady || !term) {
      setResults([]);
      return;
    }
    const lower = term.toLowerCase();
    const projectById = new Map(projects.map((project) => [project.id, project]));
    let cancelled = false;
    void data
      .searchTodos(term)
      .then((todos) => {
        if (cancelled) return;
        setResults(
          todos.flatMap((todo) => {
            const project = projectById.get(todo.projectId);
            if (!project) return [];
            return [{ todo, project, matchedText: extractMatchedText(todo, lower) }];
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dbReady, keyword, projects, revision]);

  const clear = useCallback(() => setKeyword(''), []);

  return { keyword, setKeyword, results, clear };
}
