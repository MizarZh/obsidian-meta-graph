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

export function getDefaultLabelColor(document: Document): string {
	return cssColorToHex(
		document,
		document.defaultView
			?.getComputedStyle(document.body)
			.getPropertyValue('--text-normal')
			.trim() || '#000000',
	);
}

export function cssColorToHex(document: Document, color: string): string {
	const probe = document.createElement('span');
	probe.style.color = color;
	probe.hidden = true;
	document.body.appendChild(probe);
	const normalized =
		document.defaultView?.getComputedStyle(probe).color ?? '';
	probe.remove();
	const channels = normalized.match(/\d+/gu);
	if (!channels || channels.length < 3) {
		return '#000000';
	}
	return `#${channels
		.slice(0, 3)
		.map((channel) =>
			Math.max(0, Math.min(255, Number(channel)))
				.toString(16)
				.padStart(2, '0'),
		)
		.join('')}`;
}
