/**
 * @file 数学公式语法探测
 * @description 独立成模块而非与 MarkdownContent 同文件导出：
 *   react-refresh 要求组件文件只导出组件；导出弹窗也需要在截图前
 *   预判是否要等待 KaTeX 懒模块，故该谓词被两处消费。
 */

/** 内容是否含数学公式语法（$$…$$ / $…$ / \(…\) / \[…\]），含则走 KaTeX 异步渲染。 */
export const contentHasMath = (content: string): boolean =>
  /(^|[^\\])\$\$?[\s\S]+?\$\$?|\\\(|\\\[/.test(content);
