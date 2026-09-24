/** Tab-local manual serialization. No durable jobs, backoff resend or implicit retry. */
export class ManualSendQueue {
  private queues = new Map<string, Array<{ id: string; run: () => Promise<void> }>>();
  private running = new Set<string>();
  private epoch = 0;
  constructor(private blocked: (key: string) => boolean) {}
  enqueue(key: string, id: string, run: () => Promise<void>) {
    const queue = this.queues.get(key) || [];
    if (queue.some((item) => item.id === id)) return;
    queue.push({ id, run });
    this.queues.set(key, queue);
    void this.resume(key);
  }
  cancel(key: string, id: string) {
    this.queues.set(key, (this.queues.get(key) || []).filter((item) => item.id !== id));
  }
  async resume(key: string) {
    if (this.running.has(key) || this.blocked(key)) return;
    const item = this.queues.get(key)?.shift();
    if (!item) return;
    const epoch = this.epoch;
    this.running.add(key);
    try { await item.run(); }
    finally {
      if (epoch === this.epoch) {
        this.running.delete(key);
        void this.resume(key);
      }
    }
  }
  clear() { this.epoch++; this.queues.clear(); this.running.clear(); }
}
