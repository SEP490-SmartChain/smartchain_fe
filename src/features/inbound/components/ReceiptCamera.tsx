import { useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Button } from '@/components/Common';

interface Props {
  mode: 'photo' | 'video';
  onCaptured: (file: File) => void;
  onClose: () => void;
}

/** Capture stays local until the user reviews and uploads the resulting file. */
export function ReceiptCamera({ mode, onCaptured, onClose }: Props) {
  const t = useTranslations('Receiving');
  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    let disposed = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('cameraUnavailable'));
      return () => {
        active.current = false;
      };
    }
    void navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then((value) => {
        if (disposed) {
          value.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = value;
        if (preview.current) preview.current.srcObject = value;
      })
      .catch(() => {
        if (!disposed) setError(t('cameraUnavailable'));
      });
    return () => {
      disposed = true;
      active.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [t]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    const limit = window.setTimeout(() => recorder.current?.stop(), 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(limit);
    };
  }, [recording]);

  function photograph() {
    const video = preview.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!active.current) return;
        if (!blob) {
          setError(t('cameraUnavailable'));
          return;
        }
        onCaptured(new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.85,
    );
  }

  function startRecording() {
    if (!stream.current || typeof MediaRecorder === 'undefined') {
      setError(t('cameraUnavailable'));
      return;
    }
    const mimeType = ['video/mp4', 'video/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) {
      setError(t('cameraUnavailable'));
      return;
    }
    try {
      const current = new MediaRecorder(stream.current, {
        mimeType,
        videoBitsPerSecond: 2_000_000,
      });
      const chunks: Blob[] = [];
      let size = 0,
        failed = false;
      current.ondataavailable = (event) => {
        size += event.data.size;
        if (size > 50 * 1024 * 1024) {
          failed = true;
          if (active.current) setError(t('photoInvalid'));
          if (current.state === 'recording') current.stop();
        } else chunks.push(event.data);
      };
      current.onerror = () => {
        failed = true;
        if (active.current) setError(t('cameraUnavailable'));
      };
      current.onstop = () => {
        if (!active.current) return;
        setRecording(false);
        if (!failed && chunks.length) {
          onCaptured(
            new File(chunks, `receipt-${Date.now()}.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`, {
              type: mimeType,
            }),
          );
        }
      };
      recorder.current = current;
      current.start(1000);
      setSeconds(0);
      setRecording(true);
    } catch {
      setError(t('cameraUnavailable'));
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--sc-border-default)] p-3">
      {error && <Alert variant="warning" title={error} />}
      <video
        ref={preview}
        autoPlay
        muted
        playsInline
        aria-label={t('cameraPreview')}
        onLoadedMetadata={() => setReady(true)}
        className="max-h-80 w-full rounded-lg bg-black object-contain"
      />
      {recording && <p role="status">{t('recordingSeconds', { seconds })}</p>}
      <div className="flex flex-wrap gap-2">
        {mode === 'photo' ? (
          <Button type="button" disabled={!ready} onClick={photograph}>
            {t('takePhoto')}
          </Button>
        ) : recording ? (
          <Button type="button" onClick={() => recorder.current?.stop()}>
            {t('stopRecording')}
          </Button>
        ) : (
          <Button type="button" disabled={!ready} onClick={startRecording}>
            {t('startRecording')}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          {t('cameraClose')}
        </Button>
      </div>
    </div>
  );
}
