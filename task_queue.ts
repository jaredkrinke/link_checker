export type TaskHandler<T> = (task: T) => Promise<void>;

export class TaskQueueError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class TaskQueue<T> {
    private queued: T[];
    private running: Promise<void>[];

    constructor(private handler: TaskHandler<T>, private maxConcurrency = 1) {
        if (this.maxConcurrency <= 0) {
            throw new TaskQueueError("maxConcurrency must be > 0");
        }

        this.queued = [];
        this.running = [];
    }

    private tryPop(): boolean {
        if (this.running.length < this.maxConcurrency) {
            const task = this.queued.shift();
            if (task !== undefined) {
                const running = this.running;
                const promise = this.handler(task).finally(() => running.splice(running.indexOf(promise), 1));
                running.push(promise);
                return true;
            }
        }
        return false;
    }

    enqueue(task: T): void {
        this.queued.push(task);
        this.tryPop();
    }

    async drain(): Promise<void> {
        while (this.queued.length > 0 || this.running.length > 0) {
            if (!this.tryPop()) {
                try {
                    await Promise.race(this.running);
                } catch (_e) {
                    // Rejection should be handled elsewhere
                }
            }
        }
    }
}