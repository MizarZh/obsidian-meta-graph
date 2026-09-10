import type { MetaGraphDocument, WorkspaceState } from '@/core/types';
import { serializeMetaGraphState } from '@/workspace/meta-graph-model';

interface AutoSaveTimers {
	setTimeout(
		handler: () => void,
		timeout: number,
	): ReturnType<typeof setTimeout>;
	clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export class WorkspaceAutoSave<DocumentType = MetaGraphDocument> {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private pendingState: WorkspaceState | undefined;
	private lastSavedFingerprint = '';
	private inFlight: Promise<void> | undefined;

	constructor(
		private readonly onSave: (document: DocumentType) => Promise<void>,
		private readonly delayMs = 350,
		private readonly timers: AutoSaveTimers = window,
		private readonly serialize: (
			state: WorkspaceState,
		) => DocumentType = serializeMetaGraphState as unknown as (
			state: WorkspaceState,
		) => DocumentType,
		private readonly onError: (error: unknown) => void = () => undefined,
	) {}

	initialize(state: WorkspaceState): void {
		this.lastSavedFingerprint = this.fingerprint(this.serialize(state));
	}

	schedule(state: WorkspaceState): void {
		this.pendingState = state;
		this.clearTimer();
		this.timer = this.timers.setTimeout(() => {
			void this.flush().catch(this.onError);
		}, this.delayMs);
	}

	flush(): Promise<void> {
		this.clearTimer();
		if (this.inFlight) return this.inFlight.then(() => this.flush());
		if (!this.pendingState) return Promise.resolve();
		const task = this.savePending();
		this.inFlight = task;
		const clearInFlight = (): void => {
			if (this.inFlight === task) this.inFlight = undefined;
		};
		void task.then(clearInFlight, clearInFlight);
		return task;
	}

	private clearTimer(): void {
		if (this.timer !== undefined) {
			this.timers.clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	private async savePending(): Promise<void> {
		while (this.pendingState) {
			const state = this.pendingState;
			this.pendingState = undefined;
			this.clearTimer();
			try {
				const document = this.serialize(state);
				const fingerprint = this.fingerprint(document);
				if (fingerprint !== this.lastSavedFingerprint) {
					await this.onSave(document);
					this.lastSavedFingerprint = fingerprint;
				}
			} catch (error) {
				// A newer edit takes precedence over the failed snapshot.
				this.pendingState ??= state;
				throw error;
			}
		}
	}

	private fingerprint(document: DocumentType): string {
		return JSON.stringify(document);
	}
}
