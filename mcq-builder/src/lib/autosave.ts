export type SaveStatus = 'pending' | 'saved' | 'error';
/** Serializes only the latest committed state, once per edit burst. */
export function createAutosaver<T>(write: (raw: string) => boolean, onStatus: (status: SaveStatus, bytes?: number) => void, delay = 400) {
  let latest: T;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous: string | undefined;
  function flush() {
    clearTimeout(timer);
    if (!dirty) return;
    try {
      const raw = JSON.stringify(latest);
      const ok = raw === previous || write(raw);
      if (ok) { previous = raw; dirty = false; }
      onStatus(ok ? 'saved' : 'error', new TextEncoder().encode(raw).length);
    } catch { onStatus('error'); }
  }
  return {
    schedule(value: T) { latest = value; dirty = true; clearTimeout(timer); onStatus('pending'); timer = setTimeout(flush, delay); },
    flush,
    cancel() { clearTimeout(timer); dirty = false; },
  };
}
