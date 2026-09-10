import type { App, TFile } from 'obsidian';
import {
	addEdge,
	addNode,
	normalizePath,
	removeEdge,
	removeNode,
} from '@/core/knowledge-index';
import type { MetadataIndexRecord } from '@/core/metadata-indexer';
import type {
	ConnectionFieldSpec,
	KnowledgeEdge,
	KnowledgeNode,
} from '@/core/types';
import type { LargeVaultMode } from '@/settings/settings';
import type {
	WorkspaceIndexBuild,
	WorkspaceIndexSnapshot,
} from '@/workspace/services/query-service';

interface WorkspaceIndexCacheEntry extends WorkspaceIndexBuild {
	dirtyFiles: Map<string, TFile>;
	edgeOwners: Map<string, Map<string, KnowledgeEdge>>;
	additionalNodeOwners: Map<string, Map<string, KnowledgeNode>>;
	tagCounts: Map<string, number>;
	domainCounts: Map<string, number>;
}

export interface WorkspaceIndexPerformanceSnapshot {
	fullBuildCount: number;
	incrementalBuildCount: number;
	lastBuildKind?: 'full' | 'incremental';
	lastBuildDurationMs?: number;
	lastChangedFileCount: number;
	markdownFileCount: number;
	largeVaultMode: LargeVaultMode;
	largeVaultModeActive: boolean;
}

export class WorkspaceIndexService {
	private readonly snapshots = new Map<string, WorkspaceIndexCacheEntry>();
	private readonly pending = new Map<
		string,
		Promise<WorkspaceIndexSnapshot>
	>();
	private readonly listeners = new Set<() => void>();
	private revision = 0;
	private largeVaultMode: LargeVaultMode = 'auto';
	private markdownFileCount = 0;
	private ready: boolean;
	private resolveReady?: () => void;
	private readonly readyPromise: Promise<void>;
	private readonly performance: WorkspaceIndexPerformanceSnapshot = {
		fullBuildCount: 0,
		incrementalBuildCount: 0,
		lastChangedFileCount: 0,
		markdownFileCount: 0,
		largeVaultMode: 'auto',
		largeVaultModeActive: false,
	};

	constructor(private readonly app: App) {
		this.ready = app.workspace?.layoutReady ?? true;
		this.readyPromise = this.ready
			? Promise.resolve()
			: new Promise((resolve) => {
					this.resolveReady = resolve;
				});
	}

	markReady(): void {
		if (this.ready) return;
		this.ready = true;
		this.resolveReady?.();
		this.resolveReady = undefined;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	setLargeVaultMode(mode: LargeVaultMode): void {
		this.largeVaultMode = mode;
		this.syncPerformanceMode();
	}

	isLargeVaultModeActive(): boolean {
		return (
			this.largeVaultMode === 'on' ||
			(this.largeVaultMode === 'auto' && this.markdownFileCount >= 5_000)
		);
	}

	invalidate(): void {
		this.revision += 1;
		this.snapshots.clear();
		this.pending.clear();
		this.emit();
	}

	invalidateFile(file: TFile): void {
		if (!this.isLargeVaultModeActive()) {
			this.invalidate();
			return;
		}
		const path = normalizePath(file.path);
		for (const entry of this.snapshots.values()) {
			if (!entry.filePaths.has(path)) {
				this.invalidate();
				return;
			}
		}
		this.revision += 1;
		for (const entry of this.snapshots.values()) {
			entry.dirtyFiles.set(path, file);
		}
		this.pending.clear();
		this.emit();
	}

	getPerformanceSnapshot(): WorkspaceIndexPerformanceSnapshot {
		return { ...this.performance };
	}

	async read(
		debug: boolean,
		connectionFields: string[] | ConnectionFieldSpec[],
	): Promise<WorkspaceIndexSnapshot> {
		await this.readyPromise;
		const key = createIndexSnapshotKey(debug, connectionFields);
		const pendingKey = `${this.revision}:${key}`;
		const pending = this.pending.get(pendingKey);
		if (pending) {
			return pending;
		}
		const cached = this.snapshots.get(key);
		if (cached?.dirtyFiles.size === 0) {
			return cached.snapshot;
		}
		const work = cached
			? this.rebuildIncrementally(cached, debug, connectionFields)
			: this.build(key, debug, connectionFields, this.revision);
		const build = work.finally(() => {
			if (this.pending.get(pendingKey) === build) {
				this.pending.delete(pendingKey);
			}
		});
		this.pending.set(pendingKey, build);
		return build;
	}

	private async build(
		key: string,
		debug: boolean,
		connectionFields: string[] | ConnectionFieldSpec[],
		revision: number,
	): Promise<WorkspaceIndexSnapshot> {
		const startedAt = performance.now();
		const { buildWorkspaceIndexState } =
			await import('@/workspace/services/query-service');
		const result = buildWorkspaceIndexState(
			this.app,
			debug,
			connectionFields,
		);
		if (revision === this.revision) {
			this.snapshots.set(key, createCacheEntry(result));
		}
		this.performance.fullBuildCount += 1;
		this.performance.lastBuildKind = 'full';
		this.performance.lastBuildDurationMs = performance.now() - startedAt;
		this.performance.lastChangedFileCount = result.records.size;
		this.markdownFileCount = result.records.size;
		this.syncPerformanceMode();
		return result.snapshot;
	}

	private async rebuildIncrementally(
		entry: WorkspaceIndexCacheEntry,
		debug: boolean,
		connectionFields: string[] | ConnectionFieldSpec[],
	): Promise<WorkspaceIndexSnapshot> {
		const startedAt = performance.now();
		const { MetadataIndexer } = await import('@/core/metadata-indexer');
		const revision = this.revision;
		const changedFiles = [...entry.dirtyFiles.values()];
		const indexer = new MetadataIndexer(this.app, debug, connectionFields);
		// Parse the entire batch before changing the shared snapshot. A failed
		// read keeps every dirty file available for the next attempt.
		const records = changedFiles.map((file) =>
			indexer.buildFileRecord(file, entry.filePaths),
		);
		for (const record of records) {
			applyRecordDelta(entry, record);
		}
		finalizeRecordBatch(entry, records);
		// Do not acknowledge a newer invalidation, even for the same TFile.
		if (revision === this.revision) {
			for (const record of records) entry.dirtyFiles.delete(record.path);
		}
		this.performance.incrementalBuildCount += 1;
		this.performance.lastBuildKind = 'incremental';
		this.performance.lastBuildDurationMs = performance.now() - startedAt;
		this.performance.lastChangedFileCount = changedFiles.length;
		return entry.snapshot;
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}

	private syncPerformanceMode(): void {
		this.performance.markdownFileCount = this.markdownFileCount;
		this.performance.largeVaultMode = this.largeVaultMode;
		this.performance.largeVaultModeActive = this.isLargeVaultModeActive();
	}
}

function createCacheEntry(
	result: WorkspaceIndexBuild,
): WorkspaceIndexCacheEntry {
	const entry: WorkspaceIndexCacheEntry = {
		...result,
		dirtyFiles: new Map(),
		edgeOwners: new Map(),
		additionalNodeOwners: new Map(),
		tagCounts: new Map(),
		domainCounts: new Map(),
	};
	for (const record of result.records.values()) {
		addRecordOwnership(entry, record);
		incrementValues(entry.tagCounts, record.node.tags);
		incrementValues(entry.domainCounts, record.node.domains);
	}
	return entry;
}

function applyRecordDelta(
	entry: WorkspaceIndexCacheEntry,
	record: MetadataIndexRecord,
): void {
	const previous = entry.records.get(record.path);
	if (previous) {
		removeRecordOwnership(entry, previous);
		incrementValues(entry.tagCounts, previous.node.tags, -1);
		incrementValues(entry.domainCounts, previous.node.domains, -1);
	}
	entry.records.set(record.path, record);
	addNode(entry.snapshot.index, record.node);
	addRecordOwnership(entry, record);
	incrementValues(entry.tagCounts, record.node.tags);
	incrementValues(entry.domainCounts, record.node.domains);
}

function finalizeRecordBatch(
	entry: WorkspaceIndexCacheEntry,
	records: readonly MetadataIndexRecord[],
): void {
	if (records.length === 0) return;
	const changedPaths = new Set(records.map((record) => record.path));
	entry.snapshot.unresolvedLinks = entry.snapshot.unresolvedLinks
		.filter((link) => !changedPaths.has(normalizePath(link.sourcePath)))
		.concat(records.flatMap((record) => record.unresolvedLinks));
	entry.snapshot.metadataSources = entry.snapshot.metadataSources
		.filter((source) => !changedPaths.has(normalizePath(source.path)))
		.concat(records.flatMap((record) => record.metadataSources));
	entry.snapshot.availableTags = [...entry.tagCounts.keys()].sort(
		(left, right) => left.localeCompare(right),
	);
	entry.snapshot.availableDomains = [...entry.domainCounts.keys()].sort(
		(left, right) => left.localeCompare(right),
	);
}

function addRecordOwnership(
	entry: WorkspaceIndexCacheEntry,
	record: MetadataIndexRecord,
): void {
	for (const node of record.additionalNodes) {
		const owners =
			entry.additionalNodeOwners.get(node.id) ??
			new Map<string, KnowledgeNode>();
		owners.set(record.path, node);
		entry.additionalNodeOwners.set(node.id, owners);
		if (!entry.filePaths.has(node.id)) {
			addNode(entry.snapshot.index, owners.values().next().value ?? node);
		}
	}
	for (const edge of record.edges) {
		const owners =
			entry.edgeOwners.get(edge.id) ?? new Map<string, KnowledgeEdge>();
		owners.set(record.path, edge);
		entry.edgeOwners.set(edge.id, owners);
		if (!entry.snapshot.index.edges.has(edge.id)) {
			addEdge(entry.snapshot.index, owners.values().next().value ?? edge);
		}
	}
}

function removeRecordOwnership(
	entry: WorkspaceIndexCacheEntry,
	record: MetadataIndexRecord,
): void {
	for (const edge of record.edges) {
		const owners = entry.edgeOwners.get(edge.id);
		owners?.delete(record.path);
		removeEdge(entry.snapshot.index, edge.id);
		const replacement = owners?.values().next().value;
		if (replacement) {
			addEdge(entry.snapshot.index, replacement);
		} else {
			entry.edgeOwners.delete(edge.id);
		}
	}
	for (const node of record.additionalNodes) {
		const owners = entry.additionalNodeOwners.get(node.id);
		owners?.delete(record.path);
		if (owners?.size) {
			if (!entry.filePaths.has(node.id)) {
				addNode(
					entry.snapshot.index,
					owners.values().next().value ?? node,
				);
			}
		} else {
			entry.additionalNodeOwners.delete(node.id);
			if (!entry.filePaths.has(node.id)) {
				removeNode(entry.snapshot.index, node.id);
			}
		}
	}
}

function incrementValues(
	counts: Map<string, number>,
	values: readonly string[],
	delta = 1,
): void {
	for (const value of new Set(values)) {
		const count = (counts.get(value) ?? 0) + delta;
		if (count > 0) counts.set(value, count);
		else counts.delete(value);
	}
}

function createIndexSnapshotKey(
	debug: boolean,
	connectionFields: string[] | ConnectionFieldSpec[],
): string {
	return JSON.stringify({
		debug,
		connectionFields: connectionFields
			.map((item) =>
				typeof item === 'string'
					? item
					: `${item.field}:${item.mode}:${item.reverseField ?? ''}`,
			)
			.sort((left, right) => left.localeCompare(right)),
	});
}
