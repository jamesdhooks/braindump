/**
 * In-process pub/sub for op broadcast. Cheap for single-node deploys.
 * For multi-node you'd swap this for Redis pub/sub or LISTEN/NOTIFY.
 */
type Handler = (payload: string) => void;

const channels = new Map<string, Set<Handler>>();

export function subscribe(spaceId: string, fn: Handler): () => void {
  let set = channels.get(spaceId);
  if (!set) {
    set = new Set();
    channels.set(spaceId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) channels.delete(spaceId);
  };
}

export function publish(spaceId: string, payload: string): void {
  const set = channels.get(spaceId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch {
      // swallow subscriber errors
    }
  }
}
