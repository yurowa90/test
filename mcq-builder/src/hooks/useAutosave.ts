import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createAutosaver } from '../lib/autosave';
import type { SaveStatus } from '../lib/autosave';
import { storage } from '../lib/storage';

export function useAutosave<T>(key: string, value: T, enabled = true) {
  const [status, setStatus] = useState<SaveStatus>('pending');
  const [bytes, setBytes] = useState(0);
  const saver = useRef<ReturnType<typeof createAutosaver<T>> | null>(null);
  if (!saver.current) saver.current = createAutosaver<T>(raw => storage.set(key, raw), (next, size) => {
    setStatus(next); if (size !== undefined) setBytes(size);
  });
  useLayoutEffect(() => {
    if (enabled) saver.current!.schedule(value);
    else saver.current!.cancel();
  }, [value, enabled]);
  useEffect(() => {
    const flush = () => saver.current!.flush();
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => { flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  return { status, bytes, flush: () => saver.current!.flush() };
}
