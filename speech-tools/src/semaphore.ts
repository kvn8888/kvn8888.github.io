/**
 * semaphore.ts — A simple async semaphore for limiting concurrency.
 *
 * Used by both diarize.ts and transcribe.ts to cap the number of parallel
 * Azure/Mistral API calls, preventing rate-limit bursts.
 *
 * Usage:
 *   const sem = new Semaphore(10)
 *   await sem.acquire()
 *   try { ... } finally { sem.release() }
 */
export class Semaphore {
  private available: number;
  private waiters: (() => void)[] = [];

  constructor(maxConcurrent: number) {
    this.available = maxConcurrent;
  }

  /** Wait until a slot is free, then claim it. */
  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    // No slot — queue a waiter and suspend until release() picks us up
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Return one slot and wake the next waiter (if any). */
  release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Hand the slot directly to the next waiter — don't increment available
      next();
    } else {
      this.available++;
    }
  }
}
