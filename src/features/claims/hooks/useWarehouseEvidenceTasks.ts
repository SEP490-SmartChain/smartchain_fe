import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { can, getEffectiveRoles } from '@/lib/accessPolicy';
import { createUuid } from '@/lib/uuid';

import {
  isSupportedWarehouseEvidenceImage,
  warehouseEvidenceTasksApi,
} from '../api/warehouseEvidenceTasksApi';
import {
  createWarehouseEvidenceUiState,
  warehouseEvidenceUiReducer,
  type WarehouseEvidenceIntent,
  type WarehouseEvidenceUiAction,
} from '../lib/warehouseEvidenceDraft';

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isWarehouseEvidenceScopeDenied(error: unknown): boolean {
  return (
    (error instanceof ApiError && [401, 403, 404].includes(error.status)) ||
    (error instanceof Error && error.message === 'CLAIM.SCOPE_CHANGED')
  );
}

export function handleWarehouseEvidenceTaskLoadFailure(
  error: unknown,
  warehouseId: string,
  dispatch: (action: WarehouseEvidenceUiAction) => void,
  abortUpload: () => void,
  clearFileInvalid: () => void,
): void {
  const mode = isWarehouseEvidenceScopeDenied(error) ? 'denied' : 'retry';
  if (mode === 'denied') {
    abortUpload();
    clearFileInvalid();
  }
  dispatch({ type: 'loadFailed', warehouseId, mode });
}

export function useWarehouseEvidenceTasks() {
  const user = useAuthStore((state) => state.user);
  const assignedWarehouseIds = useMemo(
    () => [...new Set(user?.warehouseIds ?? [])].map((id) => id.toLowerCase()),
    [user?.warehouseIds],
  );
  const roles = useMemo(
    () => getEffectiveRoles(user?.roles ?? [], user?.actorScope),
    [user?.actorScope, user?.roles],
  );
  const canView = can(roles, 'claims.warehouseEvidence.view');
  const canSubmit = can(roles, 'claims.warehouseEvidence.submit');
  const [state, dispatch] = useReducer(
    warehouseEvidenceUiReducer,
    assignedWarehouseIds[0] ?? '',
    createWarehouseEvidenceUiState,
  );
  const [fileInvalid, setFileInvalid] = useState(false);
  const listController = useRef<AbortController | null>(null);
  const uploadController = useRef<AbortController | null>(null);

  const requestTasks = useCallback(
    async (mode: 'initial' | 'more', after?: string) => {
      const warehouseId = state.warehouseId;
      if (
        !canView ||
        !warehouseId ||
        !assignedWarehouseIds.includes(warehouseId) ||
        (mode === 'more' && !after) ||
        (listController.current && !listController.current.signal.aborted)
      ) {
        return;
      }

      const controller = new AbortController();
      listController.current = controller;
      dispatch({ type: 'loadStarted', mode });
      try {
        const page = await warehouseEvidenceTasksApi.listTasks(
          warehouseId,
          controller.signal,
          after,
        );
        if (!controller.signal.aborted) {
          dispatch({
            type: 'tasksLoaded',
            warehouseId,
            after: after ?? null,
            page,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted && !isAbortError(error)) {
          handleWarehouseEvidenceTaskLoadFailure(
            error,
            warehouseId,
            dispatch,
            () => uploadController.current?.abort(),
            () => setFileInvalid(false),
          );
        }
      } finally {
        if (listController.current === controller) listController.current = null;
      }
    },
    [assignedWarehouseIds, canView, state.warehouseId],
  );

  useEffect(() => {
    if (!state.warehouseId) return;
    void requestTasks('initial');
    return () => {
      listController.current?.abort();
    };
  }, [requestTasks, state.warehouseId]);

  useEffect(
    () => () => {
      uploadController.current?.abort();
      listController.current?.abort();
    },
    [],
  );

  const selectWarehouse = useCallback(
    (warehouseId: string) => {
      const normalizedId = warehouseId.toLowerCase();
      if (!assignedWarehouseIds.includes(normalizedId) || normalizedId === state.warehouseId) {
        return;
      }
      listController.current?.abort();
      uploadController.current?.abort();
      setFileInvalid(false);
      dispatch({ type: 'warehouseChanged', warehouseId: normalizedId });
    },
    [assignedWarehouseIds, state.warehouseId],
  );

  const selectTask = useCallback(
    (claimId: string) => {
      const task = state.tasks.find((item) => item.claimId === claimId);
      if (!task?.canSubmitEvidence || !canSubmit || state.pending) return;
      setFileInvalid(false);
      dispatch({ type: 'taskSelected', claimId });
    },
    [canSubmit, state.pending, state.tasks],
  );

  const selectFile = useCallback((file: File | null) => {
    if (file && !isSupportedWarehouseEvidenceImage(file)) {
      setFileInvalid(true);
      dispatch({ type: 'fileSelected', file: null });
      return;
    }
    setFileInvalid(false);
    dispatch({ type: 'fileSelected', file });
  }, []);

  const loadMore = useCallback(() => {
    if (state.loading === 'idle' && state.nextAfter) {
      void requestTasks('more', state.nextAfter);
    }
  }, [requestTasks, state.loading, state.nextAfter]);

  const retryList = useCallback(() => {
    if (state.loading === 'idle') void requestTasks('initial');
  }, [requestTasks, state.loading]);

  const submitEvidence = useCallback(async () => {
    if (
      !canSubmit ||
      !state.warehouseId ||
      !assignedWarehouseIds.includes(state.warehouseId) ||
      state.uploadState === 'uploading' ||
      fileInvalid
    ) {
      return;
    }
    const selectedTask = state.tasks.find((task) => task.claimId === state.selectedClaimId);
    const file = state.pending?.file ?? state.selectedFile;
    if (!selectedTask?.canSubmitEvidence || !file) return;

    const intent: WarehouseEvidenceIntent = state.pending ?? {
      claimId: selectedTask.claimId,
      expectedVersion: selectedTask.version,
      evidenceId: createUuid(),
      file,
    };
    const controller = new AbortController();
    uploadController.current = controller;
    dispatch({ type: 'uploadStarted', intent });
    try {
      await warehouseEvidenceTasksApi.uploadEvidence({
        warehouseId: state.warehouseId,
        claimId: intent.claimId,
        evidenceId: intent.evidenceId,
        expectedVersion: intent.expectedVersion,
        file: intent.file,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      dispatch({ type: 'uploadSucceeded' });
      void requestTasks('initial');
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      const mode =
        error instanceof ApiError && error.code === 'CLAIM.EVIDENCE_EXPIRED'
          ? 'expired'
          : isWarehouseEvidenceScopeDenied(error)
            ? 'denied'
            : error instanceof ApiError && [400, 409, 422].includes(error.status)
              ? 'restart'
              : 'retry';
      if (mode === 'denied') {
        listController.current?.abort();
        setFileInvalid(false);
      }
      dispatch({ type: 'uploadFailed', mode });
      if (mode === 'restart') void requestTasks('initial');
    } finally {
      if (uploadController.current === controller) uploadController.current = null;
    }
  }, [
    assignedWarehouseIds,
    canSubmit,
    fileInvalid,
    requestTasks,
    state.pending,
    state.selectedClaimId,
    state.selectedFile,
    state.tasks,
    state.uploadState,
    state.warehouseId,
  ]);

  const selectedTask = state.tasks.find((task) => task.claimId === state.selectedClaimId);
  return {
    assignedWarehouseIds,
    canSubmit,
    fileInvalid,
    loadMore,
    retryList,
    selectFile,
    selectTask,
    selectWarehouse,
    selectedTask,
    state,
    submitEvidence,
  };
}
