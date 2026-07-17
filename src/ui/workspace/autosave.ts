import type { MetaGraphDocument, WorkspaceState } from '../../core/types';
import { serializeMetaGraphState } from '../../workspace/meta-graph-model';

interface AutoSaveTimers {
	setTimeout(
		handler: () => void,
		timeout: number,
	): ReturnType<typeof setTimeout>;
	clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export class WorkspaceAutoSave<DocumentType = MetaGraphDocument> {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private pendingDocument: DocumentType | undefined;
	private lastSavedFingerprint = '';

	constructor(
		private readonly onSave: (document: DocumentType) => Promise<void>,
		private readonly delayMs = 350,
		private readonly timers: AutoSaveTimers = window,
		private readonly serialize: (
			state: WorkspaceState,
		) => DocumentType = serializeMetaGraphState as unknown as (
			state: WorkspaceState,
		) => DocumentType,
	) {}

	initialize(state: WorkspaceState): void {
		this.lastSavedFingerprint = this.fingerprint(this.serialize(state));
	}

	schedule(state: WorkspaceState): void {
		const document = this.serialize(state);
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

	private fingerprint(document: DocumentType): string {
		return JSON.stringify(document);
	}
}
