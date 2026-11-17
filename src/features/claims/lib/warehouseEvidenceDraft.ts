import type {
  WarehouseEvidenceTask,
  WarehouseEvidenceTaskPage,
} from '../api/warehouseEvidenceTasksApi';

export interface WarehouseEvidenceIntent {
  claimId: string;
  expectedVersion: number;
  evidenceId: string;
  file: File;
}

export interface WarehouseEvidenceUiState {
  warehouseId: string;
  tasks: WarehouseEvidenceTask[];
  nextAfter: string | null;
  loading: 'idle' | 'initial' | 'more';
  loadError: 'retry' | 'denied' | null;
  selectedClaimId: string | null;
  selectedFile: File | null;
  pending: WarehouseEvidenceIntent | null;
  uploadState: 'idle' | 'uploading' | 'retry';
  uploadError: 'generic' | 'expired' | 'restart' | null;
  uploadSucceeded: boolean;
}

export type WarehouseEvidenceUiAction =
  | { type: 'warehouseChanged'; warehouseId: string }
  | { type: 'loadStarted'; mode: 'initial' | 'more' }
  | {
      type: 'tasksLoaded';
      warehouseId: string;
      after: string | null;
      page: WarehouseEvidenceTaskPage;
    }
  | { type: 'loadFailed'; warehouseId: string; mode: 'retry' | 'denied' }
  | { type: 'taskSelected'; claimId: string }
  | { type: 'fileSelected'; file: File | null }
  | { type: 'uploadStarted'; intent: WarehouseEvidenceIntent }
  | { type: 'uploadFailed'; mode: 'retry' | 'expired' | 'restart' | 'denied' }
  | { type: 'uploadSucceeded' };

export function createWarehouseEvidenceUiState(warehouseId: string): WarehouseEvidenceUiState {
  return {
    warehouseId,
    tasks: [],
    nextAfter: null,
    loading: 'idle',
    loadError: null,
    selectedClaimId: null,
    selectedFile: null,
    pending: null,
    uploadState: 'idle',
    uploadError: null,
    uploadSucceeded: false,
  };
}

export function warehouseEvidenceUiReducer(
  state: WarehouseEvidenceUiState,
  action: WarehouseEvidenceUiAction,
): WarehouseEvidenceUiState {
  switch (action.type) {
    case 'warehouseChanged':
      return createWarehouseEvidenceUiState(action.warehouseId);
    case 'loadStarted':
      return { ...state, loading: action.mode, loadError: null };
    case 'tasksLoaded': {
      if (action.warehouseId !== state.warehouseId) return state;
      const tasks = action.after
        ? [
            ...state.tasks.filter(
              (item) => !action.page.items.some((next) => next.claimId === item.claimId),
            ),
            ...action.page.items,
          ]
        : action.page.items;
      const selectedTask = tasks.find((task) => task.claimId === state.selectedClaimId);
      const selectionInvalid = Boolean(state.selectedClaimId && !selectedTask?.canSubmitEvidence);
      return {
        ...state,
        tasks,
        nextAfter: action.page.nextAfter,
        loading: 'idle',
        loadError: null,
        ...(selectionInvalid
          ? {
              selectedClaimId: null,
              selectedFile: null,
              pending: null,
              uploadState: 'idle' as const,
              uploadError: state.pending ? ('restart' as const) : state.uploadError,
              uploadSucceeded: false,
            }
          : {}),
      };
    }
    case 'loadFailed':
      if (action.warehouseId !== state.warehouseId) return state;
      if (action.mode === 'denied') {
        return {
          ...createWarehouseEvidenceUiState(state.warehouseId),
          loadError: 'denied',
        };
      }
      return { ...state, loading: 'idle', loadError: 'retry' };
    case 'taskSelected':
      if (state.pending || state.uploadState === 'uploading') return state;
      return {
        ...state,
        selectedClaimId: state.selectedClaimId === action.claimId ? null : action.claimId,
        selectedFile: null,
        uploadError: null,
        uploadSucceeded: false,
      };
    case 'fileSelected':
      return state.pending || state.uploadState === 'uploading'
        ? state
        : { ...state, selectedFile: action.file, uploadError: null, uploadSucceeded: false };
    case 'uploadStarted':
      return {
        ...state,
        selectedClaimId: action.intent.claimId,
        selectedFile: action.intent.file,
        pending: action.intent,
        uploadState: 'uploading',
        uploadError: null,
        uploadSucceeded: false,
      };
    case 'uploadFailed':
      if (action.mode === 'retry') {
        return { ...state, uploadState: 'retry', uploadError: 'generic' };
      }
      if (action.mode === 'denied') {
        return {
          ...createWarehouseEvidenceUiState(state.warehouseId),
          loadError: 'denied',
        };
      }
      return {
        ...state,
        pending: null,
        uploadState: 'idle',
        uploadError: action.mode,
        uploadSucceeded: false,
      };
    case 'uploadSucceeded':
      return {
        ...state,
        selectedClaimId: null,
        selectedFile: null,
        pending: null,
        uploadState: 'idle',
        uploadError: null,
        uploadSucceeded: true,
      };
    default:
      return state;
  }
}
