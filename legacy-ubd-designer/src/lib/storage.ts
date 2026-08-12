const KEY_PREFIX = "grasps-designer:";

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(KEY_PREFIX + key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(KEY_PREFIX + key, value);
    } catch {
      /* localStorage 사용 불가(사생활 보호 모드 등) — 조용히 무시 */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(KEY_PREFIX + key);
    } catch {
      /* 무시 */
    }
  },
};

export const API_KEY_STORAGE = "gemini-api-key";
export const MODEL_STORAGE = "gemini-model";
