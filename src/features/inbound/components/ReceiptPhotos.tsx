import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Eye,
  FileImage,
  Film,
  FolderOpen,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Badge, Button, Input } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';
import { notifyInvalidForm } from '@/lib/errorNotifications';
import { createUuid } from '@/lib/uuid';
import { ApiError, apiClient } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import { ReceiptCamera } from './ReceiptCamera';
import {
  evidenceApi,
  imageIntent,
  type EvidenceIntentInput,
  type ReceiptEvidence,
} from '../api/evidenceApi';

const MAX_FILES = 10;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
const MEDIA_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];
const mediaFile = z.custom<File>(
  (value) =>
    value instanceof File &&
    MEDIA_TYPES.includes(value.type) &&
    value.size >= 12 &&
    value.size <= (value.type.startsWith('video/') ? 50 : 5) * 1024 * 1024,
);
const formSchema = z.object({
  note: z.string().trim().max(1000),
  files: z.array(mediaFile).min(1).max(MAX_FILES),
});
interface Props {
  onPendingChange?: (key: string, locked: boolean) => void;
  warehouseId: string;
  asnId: string;
  recordId: string | null;
  receiptId?: string;
  receivingRound?: number;
  canWrite: boolean;
  onUploaded?: () => void;
}
interface Attempt {
  file: File;
  input: EvidenceIntentInput;
}

function fileKey(file: File) {
  return JSON.stringify([file.name, file.size, file.lastModified, file.type]);
}

export function ReceiptPhotos({
  warehouseId,
  asnId,
  recordId,
  receiptId,
  receivingRound = 1,
  canWrite,
  onUploaded,
  onPendingChange,
}: Props) {
  const t = useTranslations('Receiving');
  const owner = useAuthStore((state) => state.user);
  const [expanded, setExpanded] = useState(recordId === null);
  const [camera, setCamera] = useState<'photo' | 'video' | null>(null);
  const [localPreviews, setLocalPreviews] = useState<{ file: File; url: string }[]>([]);
  const [photos, setPhotos] = useState<ReceiptEvidence[]>([]);
  const [listError, setListError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ id: string; url: string; video: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReceiptEvidence | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const nativePhoto = useRef<HTMLInputElement>(null);
  const nativeVideo = useRef<HTMLInputElement>(null);
  const contentId = useId();
  const noteId = useId();
  const noteErrorId = useId();
  const {
    getValues,
    register,
    setValue,
    watch,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { files: [], note: '' },
  });
  const selectedFiles = watch('files');
  const remainingSlots = Math.max(0, MAX_FILES - photos.length);
  const pickerDisabled =
    busy ||
    loading ||
    attempt !== null ||
    selectedFiles.length >= remainingSlots ||
    camera !== null;
  const invalidFileMessage = t(recordId === null ? 'photoInvalid' : 'lotPhotoInvalid');
  useEffect(() => {
    onPendingChange?.(
      `photo:${recordId}`,
      busy || attempt !== null || camera !== null || selectedFiles.length > 0,
    );
    return () => onPendingChange?.(`photo:${recordId}`, false);
  }, [onPendingChange, recordId, busy, attempt, camera, selectedFiles.length]);
  useEffect(() => {
    const previews = selectedFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setLocalPreviews(previews);
    return () => previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [selectedFiles]);
  const current = useCallback(
    (revision: number) => revision === generation.current && owner === useAuthStore.getState().user,
    [owner],
  );

  useEffect(() => {
    const revision = ++generation.current;
    const controller = new AbortController();
    active.current = controller;
    setPhotos([]);
    setCamera(null);
    setPreview(null);
    setDeleteTarget(null);
    setDeleteError('');
    setError('');
    setListError('');
    setSelectionError('');
    setAttempt(null);
    setBusy(false);
    reset();
    return () => {
      generation.current = revision + 1;
      controller.abort();
    };
  }, [warehouseId, asnId, recordId, receiptId, receivingRound, owner, reset]);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController(),
      revision = generation.current;
    setLoading(true);
    void evidenceApi
      .list(warehouseId, asnId, recordId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted && current(revision)) {
          if (recordId === null && items.some((item) => item.receiptId !== receiptId)) {
            throw new Error('Evidence belongs to another receipt');
          }
          setPhotos(items);
          setListError('');
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted && current(revision)) {
          setListError(reason instanceof ApiError ? reason.message : t('photoError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && current(revision)) setLoading(false);
      });
    return () => controller.abort();
  }, [warehouseId, asnId, recordId, owner, expanded, refresh, t, current, receiptId]);

  function selectFiles(files: File[]) {
    if (!files.length) return;
    if (
      files.some(
        (file) =>
          !mediaFile.safeParse(file).success ||
          (recordId !== null && !IMAGE_TYPES.includes(file.type)),
      )
    ) {
      setSelectionError(invalidFileMessage);
      return;
    }
    const next = new Map(getValues('files').map((file) => [fileKey(file), file]));
    for (const file of files) {
      const key = fileKey(file);
      if (!next.has(key)) next.set(key, file);
    }
    if (next.size > remainingSlots) {
      setSelectionError(t('mediaLimit', { count: remainingSlots }));
      return;
    }
    setSelectionError('');
    setError('');
    setValue('files', [...next.values()], { shouldValidate: true });
  }

  async function upload({ files, note }: z.infer<typeof formSchema>) {
    if (busy || loading || camera !== null || !canWrite || owner !== useAuthStore.getState().user) {
      return;
    }
    if (!attempt && files.length > remainingSlots) return;
    const controller = active.current;
    if (!controller) return;
    const revision = generation.current;
    setBusy(true);
    setError('');
    setSelectionError('');
    let saved = attempt;
    let uploaded = false;
    let failedFileName = '';
    let stage: 'prepare' | 'intent' | 'upload' | 'confirm' = 'prepare';
    try {
      for (const file of files) {
        failedFileName = file.name;
        stage = 'prepare';
        saved ??= {
          file,
          input: {
            ...(await imageIntent(file, createUuid())),
            ...(recordId === null ? { note, expectedRound: receivingRound } : {}),
          },
        };
        if (!current(revision)) return;
        stage = 'intent';
        const result = await evidenceApi.presign(
          warehouseId,
          asnId,
          recordId,
          saved.input,
          controller.signal,
        );
        if (!current(revision)) return;
        if (recordId === null && result.evidence.receiptId !== receiptId) {
          throw new Error('Evidence belongs to another receipt');
        }
        if (result.upload) {
          stage = 'upload';
          await apiClient.uploadSignedImage(
            result.upload.uploadUrl,
            saved.file,
            result.upload.headers,
            controller.signal,
          );
          if (!current(revision)) return;
          stage = 'confirm';
          await evidenceApi.confirm(
            warehouseId,
            asnId,
            recordId,
            result.evidence.id,
            controller.signal,
          );
        }
        if (!current(revision)) return;
        uploaded = true;
        saved = null;
        setAttempt(null);
        setValue(
          'files',
          getValues('files').filter((item) => item !== file),
        );
      }
      reset();
    } catch (reason) {
      if (controller.signal.aborted || !current(revision)) return;
      const message =
        reason instanceof ApiError
          ? reason.message
          : t(
              stage === 'upload'
                ? 'mediaStorageError'
                : stage === 'confirm'
                  ? 'mediaConfirmError'
                  : 'photoError',
            );
      setError(t('mediaSaveError', { name: failedFileName, message }));
      // Preserve the exact intent and file across lost responses or expired upload URLs.
      const rejected =
        reason instanceof ApiError &&
        ([400, 403, 404, 409, 422].includes(reason.status) ||
          (reason.status === 429 && attempt === null));
      setAttempt(rejected ? null : saved);
    } finally {
      if (current(revision)) {
        if (uploaded) {
          setLoading(true);
          setRefresh((value) => value + 1);
          onUploaded?.();
        }
        setBusy(false);
      }
    }
  }
  async function view(id: string) {
    if (busy) return;
    const controller = active.current;
    if (!controller) return;
    const revision = generation.current;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const result = await evidenceApi.download(
        warehouseId,
        asnId,
        recordId,
        id,
        controller.signal,
      );
      if (current(revision)) {
        setPreview({
          id,
          url: result.downloadUrl,
          video: photos.find((item) => item.id === id)?.contentType.startsWith('video/') ?? false,
        });
      }
    } catch (reason) {
      if (!controller.signal.aborted && current(revision)) {
        setError(reason instanceof ApiError ? reason.message : t('photoError'));
      }
    } finally {
      if (current(revision)) setBusy(false);
    }
  }
  async function remove(photo: ReceiptEvidence) {
    if (busy || recordId !== null || !photo.canDelete) return;
    const controller = active.current;
    if (!controller) return;
    const revision = generation.current;
    setBusy(true);
    setDeleteError('');
    try {
      await evidenceApi.remove(warehouseId, asnId, null, photo.id, controller.signal);
      if (current(revision)) {
        setPhotos((items) => items.filter((item) => item.id !== photo.id));
        setDeleteTarget(null);
        if (preview?.id === photo.id) setPreview(null);
        onUploaded?.();
      }
    } catch (reason) {
      if (!controller.signal.aborted && current(revision)) {
        setDeleteError(reason instanceof ApiError ? reason.message : t('photoDeleteError'));
      }
    } finally {
      if (current(revision)) setBusy(false);
    }
  }
  return (
    <div className="mt-3 space-y-3">
      <Button
        type="button"
        variant="secondary"
        aria-expanded={expanded}
        aria-controls={contentId}
        className="h-auto w-full justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-alpha-08)] text-[var(--sc-primary-dark)]">
            <FileImage size={19} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-[var(--sc-text-primary)]">
              {t(recordId === null ? 'receiptMediaTitle' : 'photoOpen')}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <Badge status="default" label={`${photos.length}/${MAX_FILES}`} />
          {expanded ? (
            <ChevronUp size={18} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} aria-hidden="true" />
          )}
        </span>
      </Button>
      {expanded && (
        <div id={contentId} className="flex flex-col gap-5 px-1 pt-1">
          <p className="max-w-4xl text-sm leading-5 text-[var(--sc-text-secondary)]">
            {t(recordId === null ? 'receiptMediaHelp' : 'photoHelp')}
          </p>
          {loading && (
            <p role="status" className="text-sm text-[var(--sc-text-secondary)]">
              {t('loading')}
            </p>
          )}
          {listError && <Alert variant="error" title={listError} />}
          {error && <Alert variant="error" title={error} />}
          {photos.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label={t('photoList')}>
              {photos.map((photo, index) => (
                <li
                  key={photo.id}
                  className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3 sm:flex-row sm:items-center"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
                    {photo.contentType.startsWith('video/') ? (
                      <Film size={18} aria-hidden="true" />
                    ) : (
                      <FileImage size={18} aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--sc-text-primary)]">
                      {t('photoNumber', { number: index + 1 })}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--sc-text-secondary)]">
                      {Math.ceil(photo.fileSizeBytes / 1024)} KB
                    </span>
                    {photo.note && (
                      <span className="mt-1 block whitespace-pre-wrap break-words text-xs text-[var(--sc-text-secondary)]">
                        {photo.note}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">
                    <Badge
                      status={photo.verifiedAt ? 'success' : 'warning'}
                      label={t(photo.verifiedAt ? 'photoConfirmed' : 'photoPending')}
                    />
                    {photo.verifiedAt && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-3"
                        disabled={busy}
                        onClick={() => void view(photo.id)}
                      >
                        <Eye size={15} aria-hidden="true" />
                        {t('photoView', { number: index + 1 })}
                      </Button>
                    )}
                    {recordId === null && canWrite && photo.canDelete && (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        className="h-9 px-3"
                        disabled={busy}
                        onClick={() => {
                          setDeleteError('');
                          setDeleteTarget(photo);
                        }}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        {t('photoDelete')}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!loading && photos.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--sc-border-strong)] bg-[var(--sc-bg-secondary)] px-4 py-3 text-sm text-[var(--sc-text-secondary)]">
              {t(recordId === null ? 'receiptMediaEmpty' : 'photoEmpty')}
            </p>
          )}
          {canWrite && (
            <form
              className="flex flex-col gap-4 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4"
              onSubmit={handleSubmit(
                (values) => void upload(values),
                () => notifyInvalidForm(),
              )}
            >
              <div className={recordId === null ? 'grid gap-4 lg:grid-cols-2' : 'space-y-3'}>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pickerDisabled}
                      onClick={() =>
                        typeof navigator.mediaDevices?.getUserMedia === 'function'
                          ? setCamera('photo')
                          : nativePhoto.current?.click()
                      }
                    >
                      <Camera size={16} aria-hidden="true" />
                      {t('takePhoto')}
                    </Button>
                    {recordId === null && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pickerDisabled}
                        onClick={() =>
                          typeof navigator.mediaDevices?.getUserMedia === 'function'
                            ? setCamera('video')
                            : nativeVideo.current?.click()
                        }
                      >
                        <Film size={16} aria-hidden="true" />
                        {t('recordVideo')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pickerDisabled}
                      onClick={() => uploadInput.current?.click()}
                    >
                      <FolderOpen size={16} aria-hidden="true" />
                      {t('photoSelect')}
                    </Button>
                  </div>
                </div>
                {recordId === null && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={noteId}
                      className="block text-sm font-medium text-[var(--sc-text-primary)]"
                    >
                      {t('mediaNote')}
                    </label>
                    <textarea
                      id={noteId}
                      rows={3}
                      maxLength={1000}
                      placeholder={t('mediaNotePlaceholder')}
                      disabled={busy || attempt !== null}
                      aria-invalid={errors.note ? true : undefined}
                      aria-describedby={errors.note ? noteErrorId : undefined}
                      className="w-full resize-y rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 py-2.5 text-sm leading-5 text-[var(--sc-text-primary)] shadow-[var(--sc-shadow-button)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--sc-text-tertiary)] hover:border-[var(--sc-primary-light)] focus:border-[var(--sc-primary)] focus:shadow-[var(--sc-shadow-focus)] disabled:cursor-not-allowed disabled:bg-[var(--sc-bg-secondary)]"
                      {...register('note')}
                    />
                    {errors.note && (
                      <Alert variant="error" compact id={noteErrorId}>
                        {t('mediaNoteInvalid')}
                      </Alert>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden">
                <Input
                  ref={uploadInput}
                  type="file"
                  label={t('photoSelect')}
                  accept={(recordId === null ? MEDIA_TYPES : IMAGE_TYPES).join(',')}
                  disabled={pickerDisabled}
                  multiple
                  onChange={(event) => {
                    selectFiles(Array.from(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
                <Input
                  ref={nativePhoto}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  aria-label={t('takePhoto')}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) selectFiles([file]);
                    event.target.value = '';
                  }}
                />
                {recordId === null && (
                  <Input
                    ref={nativeVideo}
                    type="file"
                    accept="video/mp4,video/webm"
                    capture="environment"
                    aria-label={t('recordVideo')}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) selectFiles([file]);
                      event.target.value = '';
                    }}
                  />
                )}
              </div>
              {camera && (
                <ReceiptCamera
                  mode={camera}
                  onClose={() => setCamera(null)}
                  onCaptured={(file) => {
                    selectFiles([file]);
                    setCamera(null);
                  }}
                />
              )}
              {selectedFiles.length > 0 && (
                <ul className="space-y-2" aria-label={t('pendingMediaList')}>
                  {localPreviews
                    .filter(({ file }) => selectedFiles.includes(file))
                    .map(({ file, url }) => (
                      <li
                        key={fileKey(file)}
                        className="flex flex-col gap-3 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3 sm:flex-row sm:items-center"
                      >
                        <div className="flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--sc-bg-secondary)] sm:w-40">
                          {file.type.startsWith('video/') ? (
                            <video
                              src={url}
                              controls
                              playsInline
                              aria-label={t('videoPreview')}
                              className="max-h-28 w-full object-contain"
                            />
                          ) : (
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="break-all text-sm font-medium text-[var(--sc-text-primary)]">
                            {file.name}
                          </p>
                          <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
                            {Math.ceil(file.size / 1024)} KB
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || attempt !== null}
                          aria-label={t('discardNamedMedia', { name: file.name })}
                          onClick={() => {
                            setValue(
                              'files',
                              getValues('files').filter((item) => item !== file),
                            );
                            setSelectionError('');
                            setError('');
                          }}
                        >
                          {t('discardMedia')}
                        </Button>
                      </li>
                    ))}
                </ul>
              )}
              {selectionError && <Alert variant="error" title={selectionError} />}
              {errors.files && selectedFiles.length > 0 && (
                <Alert variant="error" title={invalidFileMessage} />
              )}
              {!attempt && selectedFiles.length > remainingSlots && !selectionError && (
                <Alert variant="error" title={t('mediaLimit', { count: remainingSlots })} />
              )}
              {attempt && <Alert variant="warning" title={t('photoRetryHelp')} />}
              {selectedFiles.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    isLoading={busy}
                    disabled={
                      busy ||
                      loading ||
                      camera !== null ||
                      (!attempt && selectedFiles.length > remainingSlots)
                    }
                  >
                    {attempt ? t('photoRetry') : t('photoUpload')}
                  </Button>
                </div>
              )}
            </form>
          )}
        </div>
      )}
      {preview && (
        <Modal
          isOpen
          onClose={() => setPreview(null)}
          title={t(preview.video ? 'videoPreview' : 'photoPreview')}
          width="1000px"
        >
          <div className="flex min-h-60 items-center justify-center">
            {preview.video ? (
              <video
                src={preview.url}
                controls
                playsInline
                aria-label={t('videoPreview')}
                className="max-h-[70vh] w-full rounded-lg bg-black"
              />
            ) : (
              <img
                src={preview.url}
                alt={t('photoPreview')}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] max-w-full rounded-lg object-contain"
                onError={() => {
                  setPreview(null);
                  setError(t('photoError'));
                }}
              />
            )}
          </div>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          isOpen
          onClose={() => {
            if (!busy) {
              setDeleteTarget(null);
              setDeleteError('');
            }
          }}
          title={t('photoDeleteTitle')}
        >
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[var(--sc-text-secondary)]">
              {t('photoDeleteConfirm')}
            </p>
            {deleteError && <Alert variant="error" title={deleteError} />}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError('');
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => void remove(deleteTarget)}
              >
                <Trash2 size={15} aria-hidden="true" />
                {t('photoDelete')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
