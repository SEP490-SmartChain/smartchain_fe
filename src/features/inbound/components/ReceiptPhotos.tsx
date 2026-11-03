import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Controller, useForm } from 'react-hook-form';

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

const formSchema = z.object({
  note: z.string().trim().max(1000),
  photo: z.custom<File>(
    (value) =>
      value instanceof File &&
      ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'].includes(value.type) &&
      value.size >= 12 &&
      value.size <= (value.type.startsWith('video/') ? 50 : 5) * 1024 * 1024,
  ),
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
  const [localPreview, setLocalPreview] = useState('');
  const [photos, setPhotos] = useState<ReceiptEvidence[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ id: string; url: string; video: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReceiptEvidence | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [fileRevision, setFileRevision] = useState(0);
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
    control,
    register,
    setValue,
    watch,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ photo: File; note: string }>({
    resolver: zodResolver(formSchema),
    defaultValues: { note: '' },
  });
  const selectedFile = watch('photo');
  useEffect(() => {
    onPendingChange?.(
      `photo:${recordId}`,
      busy || attempt !== null || camera !== null || Boolean(selectedFile),
    );
    return () => onPendingChange?.(`photo:${recordId}`, false);
  }, [onPendingChange, recordId, busy, attempt, camera, selectedFile]);
  useEffect(() => {
    if (!selectedFile) {
      setLocalPreview('');
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);
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
          setError('');
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted && current(revision)) {
          setError(reason instanceof ApiError ? reason.message : t('photoError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && current(revision)) setLoading(false);
      });
    return () => controller.abort();
  }, [warehouseId, asnId, recordId, owner, expanded, refresh, t, current, receiptId]);

  async function upload(file?: File) {
    if (busy || !canWrite || owner !== useAuthStore.getState().user) return;
    const controller = active.current;
    if (!controller) return;
    const revision = generation.current;
    setBusy(true);
    setError('');
    let stage: 'prepare' | 'intent' | 'upload' | 'confirm' = 'prepare';
    try {
      const saved =
        attempt ??
        (file
          ? {
              file,
              input: {
                ...(await imageIntent(file, createUuid())),
                ...(recordId === null
                  ? { note: watch('note')?.trim() ?? '', expectedRound: receivingRound }
                  : {}),
              },
            }
          : null);
      if (!saved || !current(revision)) return;
      setAttempt(saved);
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
      if (current(revision)) {
        setAttempt(null);
        reset();
        setFileRevision((value) => value + 1);
        setRefresh((value) => value + 1);
        onUploaded?.();
      }
    } catch (reason) {
      if (controller.signal.aborted || !current(revision)) return;
      setError(
        reason instanceof ApiError
          ? reason.message
          : t(
              stage === 'upload'
                ? 'mediaStorageError'
                : stage === 'confirm'
                  ? 'mediaConfirmError'
                  : 'photoError',
            ),
      );
      // Preserve the exact intent and file across lost responses or expired upload URLs.
      if (reason instanceof ApiError && [400, 403, 404, 409, 422, 429].includes(reason.status)) {
        setAttempt(null);
      }
    } finally {
      if (current(revision)) setBusy(false);
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
          <Badge status="default" label={`${photos.length}/10`} />
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
              onSubmit={handleSubmit((values) => void upload(values.photo))}
            >
              <div className={recordId === null ? 'grid gap-4 lg:grid-cols-2' : 'space-y-3'}>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || attempt !== null || photos.length >= 10 || camera !== null}
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
                        disabled={
                          busy || attempt !== null || photos.length >= 10 || camera !== null
                        }
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
                      disabled={busy || attempt !== null || photos.length >= 10 || camera !== null}
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
                      <p id={noteErrorId} className="text-xs text-[var(--sc-error-dark)]">
                        {t('mediaNoteInvalid')}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden">
                <Controller
                  name="photo"
                  control={control}
                  render={({ field }) => (
                    <Input
                      key={fileRevision}
                      type="file"
                      label={t('photoSelect')}
                      accept={
                        recordId === null
                          ? 'image/png,image/jpeg,image/webp,video/mp4,video/webm'
                          : 'image/png,image/jpeg,image/webp'
                      }
                      disabled={busy || attempt !== null || photos.length >= 10 || camera !== null}
                      name={field.name}
                      ref={(node) => {
                        field.ref(node);
                        uploadInput.current = node;
                      }}
                      onBlur={field.onBlur}
                      onChange={(event) => field.onChange(event.target.files?.[0])}
                      error={errors.photo ? t('photoInvalid') : undefined}
                    />
                  )}
                />
                <Input
                  ref={nativePhoto}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  aria-label={t('takePhoto')}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setValue('photo', file, { shouldValidate: true });
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
                      if (file) setValue('photo', file, { shouldValidate: true });
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
                    setValue('photo', file, { shouldValidate: true });
                    setCamera(null);
                  }}
                />
              )}
              {selectedFile && localPreview && (
                <div className="flex flex-col gap-3 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3 sm:flex-row sm:items-center">
                  <div className="flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--sc-bg-secondary)] sm:w-40">
                    {selectedFile.type.startsWith('video/') ? (
                      <video
                        src={localPreview}
                        controls
                        playsInline
                        aria-label={t('videoPreview')}
                        className="max-h-28 w-full object-contain"
                      />
                    ) : (
                      <img
                        src={localPreview}
                        alt={t('photoPreview')}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-medium text-[var(--sc-text-primary)]">
                      {selectedFile.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
                      {Math.ceil(selectedFile.size / 1024)} KB
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || attempt !== null}
                      onClick={() => {
                        reset();
                        setFileRevision((value) => value + 1);
                      }}
                    >
                      {t('discardMedia')}
                    </Button>
                    {attempt ? (
                      <Button type="button" disabled={busy} onClick={() => void upload()}>
                        {t('photoRetry')}
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        disabled={busy || loading || photos.length >= 10 || camera !== null}
                      >
                        {t('photoUpload')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {errors.photo && <Alert variant="error" title={t('photoInvalid')} />}
              {attempt && <Alert variant="warning" title={t('photoRetryHelp')} />}
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
