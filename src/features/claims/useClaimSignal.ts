import { useEffect, useState } from 'react';

/** A scope boundary hides data until its own lifetime signal is ready. */
export function useClaimSignal(parent?: AbortSignal): AbortSignal | null {
  const [signal, setSignal] = useState<AbortSignal | null>(null);
  useEffect(() => {
    const controller = new AbortController(),
      abort = () => controller.abort();
    parent?.addEventListener('abort', abort, { once: true });
    if (parent?.aborted) abort();
    setSignal(controller.signal);
    return () => {
      controller.abort();
      parent?.removeEventListener('abort', abort);
    };
  }, [parent]);
  return signal;
}
