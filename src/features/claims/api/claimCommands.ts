import { can, getEffectiveRoles } from '@/lib/accessPolicy';
import { getAuthScopeKey } from '@/lib/authScope';
import { createUuid } from '@/lib/uuid';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  claimsApi,
  type ClaimCreateInput,
  type ClaimDecisionInput,
  type ClaimInvestigationInput,
  type ClaimScope,
  type ClaimCommandResult,
} from './claimsApi';

export type ClaimPending =
  | { kind: 'create'; id: 'new'; input: ClaimCreateInput; operationId: string; scope: ClaimScope }
  | {
      kind: 'investigate';
      id: string;
      input: ClaimInvestigationInput;
      operationId: string;
      scope: ClaimScope;
    }
  | {
      kind: 'decide';
      id: string;
      input: ClaimDecisionInput;
      operationId: string;
      scope: ClaimScope;
    };
const pending = new Map<string, ClaimPending>();
let observedScope: string | undefined;
let watching = false;
function currentScope(): string {
  const key = getAuthScopeKey(useAuthStore.getState().user);
  if (!watching) {
    watching = true;
    observedScope = key;
    useAuthStore.subscribe((state) => {
      const next = getAuthScopeKey(state.user);
      if (next !== observedScope) {
        pending.clear();
        observedScope = next;
      }
    });
  }
  if (observedScope !== key) {
    pending.clear();
    observedScope = key;
  }
  return key;
}
const keyFor = (kind: ClaimPending['kind'], id: string) => `${currentScope()}/${kind}/${id}`;
export function getPendingClaim(kind: ClaimPending['kind'], id: string): ClaimPending | undefined {
  return pending.get(keyFor(kind, id));
}
export async function sendClaimCommand(
  command:
    | Omit<Extract<ClaimPending, { kind: 'create' }>, 'operationId'>
    | Omit<Extract<ClaimPending, { kind: 'investigate' }>, 'operationId'>
    | Omit<Extract<ClaimPending, { kind: 'decide' }>, 'operationId'>,
  signal: AbortSignal,
): Promise<ClaimCommandResult> {
  const scope = currentScope(),
    user = useAuthStore.getState().user;
  const capability =
    command.kind === 'create'
      ? 'claims.create'
      : command.kind === 'investigate'
        ? 'claims.investigate'
        : 'claims.decide';
  if (
    !scope ||
    !can(getEffectiveRoles(user?.roles ?? [], user?.actorScope), capability) ||
    signal.aborted
  ) {
    throw new Error('CLAIM.FORBIDDEN');
  }
  const key = keyFor(command.kind, command.id),
    existing = pending.get(key);
  if (
    existing &&
    (JSON.stringify(existing.input) !== JSON.stringify(command.input) ||
      JSON.stringify(existing.scope) !== JSON.stringify(command.scope))
  ) {
    throw new Error('CLAIM.PENDING_DIFFERENT_REQUEST');
  }
  const request = existing ?? { ...command, operationId: createUuid() };
  pending.set(key, request);
  try {
    let result: ClaimCommandResult;
    if (request.kind === 'create') {
      result = await claimsApi.create(
        { ...request.input, operationId: request.operationId },
        request.scope,
        signal,
      );
    } else if (request.kind === 'investigate') {
      result = await claimsApi.investigate(
        request.id,
        { ...request.input, operationId: request.operationId },
        request.scope,
        signal,
      );
    } else {
      result = await claimsApi.decide(
        request.id,
        { ...request.input, operationId: request.operationId },
        request.scope,
        signal,
      );
    }
    if (currentScope() !== scope || signal.aborted) throw new Error('CLAIM.SCOPE_CHANGED');
    pending.delete(key);
    return result;
  } catch (error) {
    if (error instanceof ApiError && [400, 403, 404, 409, 422].includes(error.status)) {
      pending.delete(key);
    }
    throw error;
  }
}
export async function retryClaimCommand(request: ClaimPending, signal: AbortSignal) {
  if (request.kind === 'create') {
    return sendClaimCommand(
      { kind: 'create', id: 'new', input: request.input, scope: request.scope },
      signal,
    );
  }
  if (request.kind === 'investigate') {
    return sendClaimCommand(
      { kind: 'investigate', id: request.id, input: request.input, scope: request.scope },
      signal,
    );
  }
  return sendClaimCommand(
    { kind: 'decide', id: request.id, input: request.input, scope: request.scope },
    signal,
  );
}
