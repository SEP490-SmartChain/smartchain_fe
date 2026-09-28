import { useCallback, useEffect, useRef, useState } from 'react';

const COPIED_FEEDBACK_MS = 2500;

/**
 * Sao chép văn bản vào clipboard và bật trạng thái "đã sao chép" trong một lúc để
 * nút đổi nhãn. Trả `false` khi trình duyệt từ chối, để nơi gọi tự báo lỗi.
 */
export function useCopyToClipboard() {
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }
    setIsCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
    return true;
  }, []);

  return { isCopied, copy };
}
