import { useEffect, useState } from 'react';

/** Trả về `value` sau khi nó đứng yên `delayMs` — tránh gọi API ở mỗi lần gõ phím. */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debouncedValue;
}
