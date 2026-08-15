/**
 * @file 可关闭浮层 Hook
 * @description 统一处理浮层的外部点击与 Escape 关闭，避免各组件重复注册全局事件。
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

type LayerRef = RefObject<HTMLElement>;

/**
 * 当浮层打开时，点击所有受保护节点以外的区域或按 Escape 即关闭。
 * 受保护节点可包含触发器和 portal 渲染的内容，避免点击触发器时误关浮层。
 */
export function useDismissibleLayer(
  isOpen: boolean,
  refs: readonly LayerRef[],
  onDismiss: () => void,
): void {
  const refsRef = useRef(refs);
  const onDismissRef = useRef(onDismiss);
  refsRef.current = refs;
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (refsRef.current.some((ref) => ref.current?.contains(target))) return;
      onDismissRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismissRef.current();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);
}
