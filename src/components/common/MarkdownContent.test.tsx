import { render, screen } from '@testing-library/react';
import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('渲染 GitHub Flavored Markdown 扩展语法', () => {
    render(
      <MarkdownContent
        content={'~~已删除~~\n\n- [x] 已完成\n- [ ] 待办\n\n| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |'}
      />,
    );

    expect(screen.getByText('已删除').tagName).toBe('DEL');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('渲染行内与块级数学公式', () => {
    const { container } = render(
      <MarkdownContent content={'行内公式 $E = mc^2$\n\n$$\n\\frac{a}{b}\n$$'} />,
    );

    expect(container.querySelectorAll('.katex')).toHaveLength(2);
    expect(container.querySelector('.katex-display')).toBeInTheDocument();
  });
});
