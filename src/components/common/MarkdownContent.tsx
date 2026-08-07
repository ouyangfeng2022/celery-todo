/**
 * @file GitHub Flavored Markdown 内容渲染器
 */

import { lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps {
  content: string;
}

const MathMarkdownContent = lazy(() => import('./MathMarkdownContent'));
const hasMath = (content: string): boolean => /(^|[^\\])\$\$?[\s\S]+?\$\$?|\\\(|\\\[/.test(content);

/** 渲染 GFM；数学公式才异步加载 KaTeX、remark-math 与对应样式。 */
export function MarkdownContent({ content }: MarkdownContentProps) {
  if (hasMath(content)) {
    return (
      <Suspense fallback={<span>{content}</span>}>
        <MathMarkdownContent content={content} />
      </Suspense>
    );
  }
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
}
