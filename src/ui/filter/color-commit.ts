import { ThrottledCommitScheduler } from './deferred-commit';

const COLOR_COMMIT_INTERVAL_MS = 120;

export class ColorCommitScheduler {
	private readonly scheduler: ThrottledCommitScheduler;

	constructor(browserWindow: Window) {
		this.scheduler = new ThrottledCommitScheduler(
			browserWindow,
			COLOR_COMMIT_INTERVAL_MS,
		);
	}

	schedule(
		key: string,
		currentColor: string,
		nextColor: string,
		commit: (color: string) => void,
	): void {
		this.scheduler.schedule(key, currentColor, nextColor, commit);
	}

	commit(
		key: string,
		currentColor: string,
		nextColor: string,
		commit: (color: string) => void,
	): void {
		this.scheduler.commit(key, currentColor, nextColor, commit);
	}

	clear(key: string): void {
		this.scheduler.clear(key);
	}

	clearAll(): void {
		this.scheduler.clearAll();
	}
}
