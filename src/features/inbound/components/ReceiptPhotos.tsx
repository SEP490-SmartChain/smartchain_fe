import { useCallback, useEffect, useRef, useState } from 'react';

import { Controller, useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Alert, Button, Input } from '@/components/Common';
import { ApiError, apiClient } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  evidenceApi,
  imageIntent,
  type EvidenceIntentInput,
  type ReceiptEvidence,
} from '../api/evidenceApi';

const formSchema = z.object({
  photo: z.custom<File>(
    (value) =>
      value instanceof File &&
      ['image/png', 'image/jpeg', 'image/webp'].includes(value.type) &&
      value.size >= 12 &&
      value.size <= 5 * 1024 * 1024,
  ),
});
interface Props {
  warehouseId: string;
  asnId: string;
  recordId: string;
  canWrite: boolean;
}
interface Attempt {
  file: File;
  input: EvidenceIntentInput;
}

export function ReceiptPhotos({ warehouseId, asnId, recordId, canWrite }: Props) {
  const t = useTranslations('Receiving');
  const owner = useAuthStore((state) => state.user);
  const [expanded, setExpanded] = useState(false);
  const [photos, setPhotos] = useState<ReceiptEvidence[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [fileRevision, setFileRevision] = useState(0);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ photo: File }>({ resolver: zodResolver(formSchema) });
  const current = useCallback(
    (revision: number) => revision === generation.current && owner === useAuthStore.getState().user,
    [owner],
  );

  useEffect(() => {
    const revision = ++generation.current;
    const controller = new AbortController();
    active.current = controller;
    setPhotos([]);
    setPreview(null);
    setError('');
    setAttempt(null);
    setBusy(false);
    reset();
    return () => {
      generation.current = revision + 1;
      controller.abort();
    };
  }, [warehouseId, asnId, recordId, owner, reset]);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController(),
      revision = generation.current;
    setLoading(true);
    void evidenceApi
      .list(warehouseId, asnId, recordId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted && current(revision)) {
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
  }, [warehouseId, asnId, recordId, owner, expanded, refresh, t, current]);

  async function upload(file?: File) {
    if (busy || !canWrite || owner !== useAuthStore.getState().user) return;
    const controller = active.current;
    if (!controller) return;
    const revision = generation.current;
    setBusy(true);
    setError('');
    try {
      const saved =
        attempt ?? (file ? { file, input: await imageIntent(file, crypto.randomUUID()) } : null);
      if (!saved || !current(revision)) return;
      setAttempt(saved);
      const result = await evidenceApi.presign(
        warehouseId,
        asnId,
        recordId,
        saved.input,
        controller.signal,
      );
      if (!current(revision)) return;
      if (result.upload) {
        await apiClient.uploadSignedImage(
          result.upload.uploadUrl,
          saved.file,
          result.upload.headers,
          controller.signal,
        );
        if (!current(revision)) return;
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
      }
    } catch (reason) {
      if (controller.signal.aborted || !current(revision)) return;
      setError(reason instanceof ApiError ? reason.message : t('photoError'));
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
      if (current(revision)) setPreview({ id, url: result.downloadUrl });
    } catch (reason) {
      if (!controller.signal.aborted && current(revision)) {
        setError(reason instanceof ApiError ? reason.message : t('photoError'));
      }
    } finally {
      if (current(revision)) setBusy(false);
    }
  }
  return (
    <div className="mt-3 space-y-3">
      <Button
        type="button"
        variant="outline"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {t('photoOpen')}
      </Button>
      {expanded && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('photoHelp')}</p>
          {loading && <p role="status">{t('loading')}</p>}
          {error && <Alert variant="error" title={error} />}
          <ul className="space-y-2" aria-label={t('photoList')}>
            {photos.map((photo, index) => (
              <li key={photo.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  {t('photoNumber', { number: index + 1 })} ·{' '}
                  {Math.ceil(photo.fileSizeBytes / 1024)} KB ·{' '}
                  {t(photo.verifiedAt ? 'photoConfirmed' : 'photoPending')}
                </span>
                {photo.verifiedAt && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void view(photo.id)}
                  >
                    {t('photoView', { number: index + 1 })}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!loading && photos.length === 0 && <p className="text-sm">{t('photoEmpty')}</p>}
          {preview && (
            <img
              src={preview.url}
              alt={t('photoPreview')}
              referrerPolicy="no-referrer"
              className="max-h-72 max-w-full rounded-lg object-contain"
              onError={() => {
                setPreview(null);
                setError(t('photoError'));
              }}
            />
          )}
          {canWrite && (
            <form
              className="space-y-3"
              onSubmit={handleSubmit((values) => void upload(values.photo))}
            >
              <Controller
                name="photo"
                control={control}
                render={({ field }) => (
                  <Input
                    key={fileRevision}
                    type="file"
                    label={t('photoSelect')}
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy || attempt !== null || photos.length >= 10}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    onChange={(event) => field.onChange(event.target.files?.[0])}
                    error={errors.photo ? t('photoInvalid') : undefined}
                  />
                )}
              />
              {attempt && <Alert variant="warning" title={t('photoRetryHelp')} />}
              {attempt ? (
                <Button type="button" disabled={busy} onClick={() => void upload()}>
                  {t('photoRetry')}
                </Button>
              ) : (
                <Button type="submit" disabled={busy || loading || photos.length >= 10}>
                  {t('photoUpload')}
                </Button>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
