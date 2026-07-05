export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; timestamp: number }>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() - item.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    // Refresh to update insertion order
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // delete oldest (first key in map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
         this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: K): void {
    this.cache.delete(key);
  }
}
