import type { MetaGraphDocument, WorkspaceState } from '../../core/types';
import { serializeMetaGraphState } from '../../workspace/meta-graph-model';

interface AutoSaveTimers {
	setTimeout(
		handler: () => void,
		timeout: number,
	): ReturnType<typeof setTimeout>;
	clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export class WorkspaceAutoSave {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private pendingDocument: MetaGraphDocument | undefined;
	private lastSavedFingerprint = '';

	constructor(
		private readonly onSave: (document: MetaGraphDocument) => Promise<void>,
		private readonly delayMs = 350,
		private readonly timers: AutoSaveTimers = window,
	) {}

	initialize(state: WorkspaceState): void {
		this.lastSavedFingerprint = this.fingerprint(
			serializeMetaGraphState(state),
		);
	}

	schedule(state: WorkspaceState): void {
		const document = serializeMetaGraphState(state);
		const fingerprint = this.fingerprint(document);
		if (fingerprint === this.lastSavedFingerprint) {
			return;
		}

		this.lastSavedFingerprint = fingerprint;
		this.pendingDocument = document;
		this.clearTimer();
		this.timer = this.timers.setTimeout(() => {
			this.savePending();
		}, this.delayMs);
	}

	flush(): void {
		this.clearTimer();
		this.savePending();
	}

	private clearTimer(): void {
		if (this.timer !== undefined) {
			this.timers.clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	private savePending(): void {
		const document = this.pendingDocument;
		this.pendingDocument = undefined;
		if (document) {
			void this.onSave(document);
		}
	}

	private fingerprint(document: MetaGraphDocument): string {
		return JSON.stringify(document);
	}
}
