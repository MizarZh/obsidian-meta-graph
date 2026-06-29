export class DeferredCommitScheduler {
	private readonly timers = new Map<string, number>();
	private readonly lastCommittedValues = new Map<string, string>();

	constructor(
		private readonly browserWindow: Window,
		private readonly delayMs: number,
	) {}

	schedule(
		key: string,
		currentValue: string,
		nextValue: string,
		commit: (value: string) => void,
	): void {
		this.clear(key);
		if (this.shouldSkip(key, currentValue, nextValue)) {
			return;
		}
		this.timers.set(
			key,
			this.browserWindow.setTimeout(() => {
				this.timers.delete(key);
				this.commit(key, currentValue, nextValue, commit);
			}, this.delayMs),
		);
	}

	commit(
		key: string,
		currentValue: string,
		nextValue: string,
		commit: (value: string) => void,
	): void {
		this.clear(key);
		if (this.shouldSkip(key, currentValue, nextValue)) {
			return;
		}
		this.lastCommittedValues.set(key, nextValue);
		commit(nextValue);
	}

	clear(key: string): void {
		const timer = this.timers.get(key);
		if (timer !== undefined) {
			this.browserWindow.clearTimeout(timer);
			this.timers.delete(key);
		}
	}

	clearAll(): void {
		for (const timer of this.timers.values()) {
			this.browserWindow.clearTimeout(timer);
		}
		this.timers.clear();
	}

	private shouldSkip(
		key: string,
		currentValue: string,
		nextValue: string,
	): boolean {
		if (this.lastCommittedValues.get(key) !== currentValue) {
			this.lastCommittedValues.delete(key);
		}
		return (
			nextValue === currentValue ||
			this.lastCommittedValues.get(key) === nextValue
		);
	}
}

export class ThrottledCommitScheduler {
	private readonly timers = new Map<string, number>();
	private readonly lastCommittedValues = new Map<string, string>();
	private readonly pendingValues = new Map<string, string>();

	constructor(
		private readonly browserWindow: Window,
		private readonly intervalMs: number,
	) {}

	schedule(
		key: string,
		currentValue: string,
		nextValue: string,
		commit: (value: string) => void,
	): void {
		if (this.shouldSkip(key, currentValue, nextValue)) {
			return;
		}
		if (!this.timers.has(key)) {
			this.lastCommittedValues.set(key, nextValue);
			commit(nextValue);
			this.timers.set(
				key,
				this.browserWindow.setTimeout(() => {
					this.timers.delete(key);
					const pendingValue = this.pendingValues.get(key);
					this.pendingValues.delete(key);
					if (pendingValue !== undefined) {
						this.schedule(key, nextValue, pendingValue, commit);
					}
				}, this.intervalMs),
			);
			return;
		}
		this.pendingValues.set(key, nextValue);
	}

	commit(
		key: string,
		currentValue: string,
		nextValue: string,
		commit: (value: string) => void,
	): void {
		this.clear(key);
		if (this.shouldSkip(key, currentValue, nextValue)) {
			return;
		}
		this.lastCommittedValues.set(key, nextValue);
		commit(nextValue);
	}

	clear(key: string): void {
		const timer = this.timers.get(key);
		if (timer !== undefined) {
			this.browserWindow.clearTimeout(timer);
			this.timers.delete(key);
		}
		this.pendingValues.delete(key);
	}

	clearAll(): void {
		for (const timer of this.timers.values()) {
			this.browserWindow.clearTimeout(timer);
		}
		this.timers.clear();
		this.pendingValues.clear();
	}

	private shouldSkip(
		key: string,
		currentValue: string,
		nextValue: string,
	): boolean {
		if (this.lastCommittedValues.get(key) !== currentValue) {
			this.lastCommittedValues.delete(key);
		}
		return (
			nextValue === currentValue ||
			this.lastCommittedValues.get(key) === nextValue
		);
	}
}
