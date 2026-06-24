import type { ReactNode } from 'react';
import type { Role } from '@axaxax/shared';
import { useAuth } from '../context/AuthContext';

// 권한 없는 액션은 '숨김이 아니라 비활성화 + 사유 툴팁'으로 노출(PRD §2.1).
// children은 disabled prop을 받는 단일 액션(버튼)이라고 가정한다.
interface RoleGateProps {
  /** 이 역할 중 하나여야 활성화. */
  allow: Role[];
  /** 비활성 사유(툴팁). */
  reason: string;
  /** 추가 비활성 조건(예: self-approval). */
  extraDisabled?: boolean;
  extraReason?: string;
  children: (state: { disabled: boolean; reason?: string }) => ReactNode;
}

export function RoleGate({ allow, reason, extraDisabled, extraReason, children }: RoleGateProps) {
  const { user } = useAuth();
  const roleOk = user ? allow.includes(user.role) : false;

  let disabled = false;
  let why: string | undefined;
  if (!roleOk) {
    disabled = true;
    why = reason;
  } else if (extraDisabled) {
    disabled = true;
    why = extraReason ?? reason;
  }

  // 비활성일 때만 사유 툴팁 래퍼를 씌운다.
  if (disabled && why) {
    return (
      <span className="tip" data-tip={why}>
        {children({ disabled, reason: why })}
      </span>
    );
  }
  return <>{children({ disabled })}</>;
}
