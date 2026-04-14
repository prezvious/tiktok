type Task<T> = () => Promise<T>;

export class ConcurrencyQueue {
  private inFlight = 0;
  private readonly max: number;
  private readonly waiting: Array<() => void> = [];

  constructor(max = 6) {
    this.max = max;
  }

  async run<T>(task: Task<T>): Promise<T> {
    if (this.inFlight >= this.max) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.inFlight++;
    try {
      return await task();
    } finally {
      this.inFlight--;
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}

export const previewQueue = new ConcurrencyQueue(6);
