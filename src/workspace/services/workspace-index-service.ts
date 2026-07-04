import type { App } from 'obsidian';
import type { WorkspaceIndexSnapshot } from './query-service';

export class WorkspaceIndexService {
	private readonly snapshots = new Map<string, WorkspaceIndexSnapshot>();
	private readonly pending = new Map<string, Promise<WorkspaceIndexSnapshot>>();
	private revision = 0;
	private dirty = true;

	constructor(private readonly app: App) {}

	invalidate(): void {
		this.revision += 1;
		this.dirty = true;
		this.snapshots.clear();
		this.pending.clear();
	}

	async read(
		debug: boolean,
		connectionFields: string[],
	): Promise<WorkspaceIndexSnapshot> {
		const key = createIndexSnapshotKey(debug, connectionFields);
		if (!this.dirty) {
			const snapshot = this.snapshots.get(key);
			if (snapshot) {
				return snapshot;
			}
		}
		const pendingKey = `${this.revision}:${key}`;
		const pending = this.pending.get(pendingKey);
		if (pending) {
			return pending;
		}
		const build = this.build(
			pendingKey,
			key,
			debug,
			connectionFields,
			this.revision,
		);
		this.pending.set(pendingKey, build);
		return build;
	}

	private async build(
		pendingKey: string,
		key: string,
		debug: boolean,
		connectionFields: string[],
		revision: number,
	): Promise<WorkspaceIndexSnapshot> {
		const { buildWorkspaceIndex } = await import('./query-service');
		const snapshot = buildWorkspaceIndex(this.app, debug, connectionFields);
		this.pending.delete(pendingKey);
		if (revision === this.revision) {
			this.snapshots.set(key, snapshot);
			this.dirty = false;
		}
		return snapshot;
	}
}

function createIndexSnapshotKey(
	debug: boolean,
	connectionFields: string[],
): string {
	return JSON.stringify({
		debug,
		connectionFields: [...connectionFields].sort((left, right) =>
			left.localeCompare(right),
		),
	});
}
