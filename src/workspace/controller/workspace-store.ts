import type { WorkspaceState } from '../../core/types';

export type WorkspaceStateListener = (state: WorkspaceState) => void;

export class WorkspaceStore {
	private readonly listeners = new Set<WorkspaceStateListener>();

	constructor(private state: WorkspaceState) {}

	get snapshot(): WorkspaceState {
		return this.state;
	}

	replace(state: WorkspaceState, notify = true): boolean {
		if (state === this.state) {
			return false;
		}
		this.state = state;
		if (notify) {
			this.emit();
		}
		return true;
	}

	subscribe(listener: WorkspaceStateListener): () => void {
		this.listeners.add(listener);
		listener(this.state);
		return () => this.listeners.delete(listener);
	}

	emit(): void {
		for (const listener of this.listeners) {
			listener(this.state);
		}
	}

	dispose(): void {
		this.listeners.clear();
	}
}
