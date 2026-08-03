/**
 * @file GitHub Flavored Markdown 内容渲染器
 */

import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

interface MarkdownContentProps {
  content: string;
}

/** 渲染与 GitHub 接近的 Markdown（GFM + 数学公式）。 */
export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
      {content}
    </ReactMarkdown>
  );
}
