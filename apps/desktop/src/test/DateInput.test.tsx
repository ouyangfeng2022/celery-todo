/**
 * @file DateInput 单元测试：中文显示 + 原生控件值透传
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateInput } from '../components/common/DateInput';

describe('DateInput', () => {
  it('有值时显示中文日期（跨年带年份），无值时显示占位符', () => {
    const { rerender } = render(<DateInput value="1999-12-31" onChange={vi.fn()} />);
    expect(screen.getByText('1999年12月31日')).toBeVisible();
    rerender(<DateInput value="" onChange={vi.fn()} />);
    expect(screen.getByText('选择日期')).toBeVisible();
  });

  it('原生日期控件变更时以 YYYY-MM-DD 回调', () => {
    const onChange = vi.fn();
    render(<DateInput value="" onChange={onChange} aria-label="计划日期" />);
    fireEvent.change(screen.getByLabelText('计划日期'), { target: { value: '2030-05-06' } });
    expect(onChange).toHaveBeenCalledWith('2030-05-06');
  });
});
