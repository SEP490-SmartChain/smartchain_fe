import { useEffect, useState } from 'react';

import { avatarObjectKey, uploadApi } from '@/services/uploadApi';

export function useAvatarUrl(reference?: string | null): string | undefined {
  const [resolvedUrl, setResolvedUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    const objectKey = avatarObjectKey(reference);

    if (!objectKey) {
      setResolvedUrl(reference || undefined);
      return () => {
        active = false;
      };
    }

    setResolvedUrl(undefined);
    void uploadApi
      .avatarDownloadUrl(objectKey)
      .then(({ downloadUrl }) => {
        if (active) setResolvedUrl(downloadUrl);
      })
      .catch(() => {
        if (active) setResolvedUrl(undefined);
      });

    return () => {
      active = false;
    };
  }, [reference]);

  return resolvedUrl;
}
