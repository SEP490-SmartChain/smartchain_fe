import { useEffect, useState } from 'react';

import { adminDivisionApi } from '../api/adminDivisionApi';

let cached: Promise<Map<string, string>> | null = null;

function loadProvinceNames(): Promise<Map<string, string>> {
  cached ??= adminDivisionApi
    .provinces()
    .then((rows) => new Map(rows.map((row) => [row.code, row.name])))
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}

/** Province code to name; codes stay visible until the shared reference list has loaded. */
export function useProvinceNames(): ReadonlyMap<string, string> {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let isActive = true;
    void loadProvinceNames()
      .then((loaded) => {
        if (isActive) {
          setNames(loaded);
        }
      })
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, []);
  return names;
}
