import type { ReactNode } from 'react';

import { useAccess } from '@/hooks/useAccess';

/** Chỉ cho phép MỘT kiểu điều kiện để tránh cấp quyền sai khi kết hợp nhiều điều kiện. */
type ConditionProps =
  | { capability: string; anyOf?: never; allOf?: never }
  | { capability?: never; anyOf: string[]; allOf?: never }
  | { capability?: never; anyOf?: never; allOf: string[] };

export type CanProps = ConditionProps & {
  /** Nội dung thay thế khi không đủ quyền (mặc định null). */
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * `Can` ẩn/hiện nút, tab, cột và thao tác theo capability (mục 9).
 * Chỉ là kiểm soát trải nghiệm — API vẫn là nơi quyết định authorization cuối cùng.
 */
export function Can(props: CanProps) {
  const access = useAccess();
  let allowed = true;
  if (props.capability !== undefined) {
    allowed = access.can(props.capability);
  } else if (props.anyOf !== undefined) {
    allowed = access.canAny(props.anyOf);
  } else {
    allowed = access.canAll(props.allOf);
  }

  return <>{allowed ? props.children : (props.fallback ?? null)}</>;
}
