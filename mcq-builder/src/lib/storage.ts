const KEY_PREFIX = "mcq-builder:";

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(KEY_PREFIX + key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(KEY_PREFIX + key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): boolean {
    try {
      localStorage.removeItem(KEY_PREFIX + key);
      return true;
    } catch {
      return false;
    }
  },
};

export const API_KEY_STORAGE = "gemini-api-key";
export const MODEL_STORAGE = "gemini-model";
export const DRAFT_STORAGE = "draft-v2";
