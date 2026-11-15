/** localStorage wrappers that never throw (private mode, blocked storage…). */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function randomId(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

let memDeviceId: string | null = null;
/** Stable anonymous id for this browser (used to reclaim your seat and track stats). */
export function deviceId(): string {
  if (memDeviceId) return memDeviceId;
  let id = load<string | null>("21t:device", null);
  if (!id || !/^[a-f0-9]{32}$/.test(id)) {
    id = randomId();
    save("21t:device", id);
  }
  memDeviceId = id;
  return id;
}

export interface Profile {
  name: string;
  avatar: string;
}

export const getProfile = () => load<Profile | null>("21t:profile", null);
export const setProfile = (p: Profile) => save("21t:profile", p);

export const getHostToken = (code: string) => load<string | null>(`21t:host:${code}`, null);
export const setHostToken = (code: string, token: string) => save(`21t:host:${code}`, token);
