import type {
	DebugSnapshot,
	KnowledgeEdge,
	KnowledgeIndex,
	KnowledgeNode,
	MetadataDebugEntry,
	RendererDebugState,
	UnresolvedLink,
	WorkspacePerformanceSample,
	WorkspaceState,
} from '../../core/types';
import { createWorkspaceDebugSnapshot } from '../runtime/debug-snapshot';
import {
	applyWorkspaceIndexSnapshotToState,
	projectWorkspaceState,
} from '../runtime/refresh-state';
import { WorkspaceProjectionService } from '../services/query-service';
import type { WorkspaceIndexService } from '../services/workspace-index-service';
import type { WorkspaceStore } from './workspace-store';

export class WorkspaceRefreshCoordinator {
	private index?: KnowledgeIndex;
	private indexedNodes: KnowledgeNode[] = [];
	private unresolvedLinks: UnresolvedLink[] = [];
	private metadataSources: MetadataDebugEntry[] = [];
	private readonly performanceSamples: WorkspacePerformanceSample[] = [];
	private readonly projectionService = new WorkspaceProjectionService();
	private rebuildTimer?: number;
	private initialRefreshFrame?: number;
	private unsubscribeWorkspaceIndex?: () => void;
	private refreshVersion = 0;
	private pendingRefreshForceLayout = false;
	private destroyed = false;

	constructor(
		private readonly workspaceIndex: WorkspaceIndexService,
		private readonly store: WorkspaceStore,
		private readonly debug: boolean,
	) {}

	getIndexedNodes(): KnowledgeNode[] {
		return this.indexedNodes;
	}

	getIndexedEdges(): KnowledgeEdge[] {
		return this.index ? [...this.index.edges.values()] : [];
	}

	initialize(): void {
		this.unsubscribeWorkspaceIndex ??= this.workspaceIndex.subscribe(() =>
			this.schedule(),
		);
		if (this.initialRefreshFrame !== undefined) {
			window.cancelAnimationFrame(this.initialRefreshFrame);
		}
		this.initialRefreshFrame = window.requestAnimationFrame(() => {
			this.initialRefreshFrame = undefined;
			this.schedule();
		});
	}

	schedule(forceLayout = false): void {
		this.pendingRefreshForceLayout ||= forceLayout;
		window.clearTimeout(this.rebuildTimer);
		this.rebuildTimer = window.setTimeout(() => {
			const shouldForceLayout = this.pendingRefreshForceLayout;
			this.pendingRefreshForceLayout = false;
			void this.refresh(shouldForceLayout);
		}, 300);
	}

	async refresh(forceLayout = false): Promise<void> {
		if (this.destroyed) {
			return;
		}
		const refreshVersion = ++this.refreshVersion;
		const indexStartedAt = performance.now();
		const indexSnapshot = await this.workspaceIndex.read(
			this.debug,
			this.store.snapshot.connectionFieldSpecs,
		);
		if (this.destroyed || refreshVersion !== this.refreshVersion) {
			return;
		}
		this.recordPerformance(
			'index.read',
			performance.now() - indexStartedAt,
			{
				nodeCount: indexSnapshot.index.nodes.size,
				edgeCount: indexSnapshot.index.edges.size,
			},
		);
		this.index = indexSnapshot.index;
		this.indexedNodes = [...indexSnapshot.index.nodes.values()];
		this.unresolvedLinks = indexSnapshot.unresolvedLinks;
		this.metadataSources = indexSnapshot.metadataSources;
		this.store.replace(
			applyWorkspaceIndexSnapshotToState(
				this.store.snapshot,
				indexSnapshot,
				forceLayout,
			),
			false,
		);
		this.runQuery();
	}

	runQuery(): void {
		if (!this.index || this.destroyed) {
			return;
		}
		const startedAt = performance.now();
		const state = projectWorkspaceState(
			this.store.snapshot,
			this.index,
			(index, currentState) =>
				this.projectionService.project(index, currentState),
		);
		this.store.replace(state, false);
		this.recordPerformance(
			'query.projection',
			performance.now() - startedAt,
			{
				nodeCount: state.projection?.nodes.length ?? 0,
				edgeCount: state.projection?.edges.length ?? 0,
			},
		);
		this.store.emit();
	}

	recordPerformance(
		name: string,
		durationMs: number,
		details?: WorkspacePerformanceSample['details'],
	): void {
		this.performanceSamples.push({
			name,
			durationMs: Math.round(durationMs * 100) / 100,
			recordedAt: new Date().toISOString(),
			...(details ? { details } : {}),
		});
		if (this.performanceSamples.length > 50) {
			this.performanceSamples.splice(
				0,
				this.performanceSamples.length - 50,
			);
		}
	}

	getDebugSnapshot(
		state: WorkspaceState,
		rendererDebugState: RendererDebugState,
	): DebugSnapshot {
		return createWorkspaceDebugSnapshot({
			state,
			index: this.index,
			unresolvedLinks: this.unresolvedLinks,
			metadataSources: this.metadataSources,
			rendererDebugState,
			performance: {
				index: this.workspaceIndex.getPerformanceSnapshot(),
				samples: [...this.performanceSamples],
			},
		});
	}

	dispose(): void {
		this.destroyed = true;
		this.refreshVersion += 1;
		this.unsubscribeWorkspaceIndex?.();
		this.unsubscribeWorkspaceIndex = undefined;
		if (this.initialRefreshFrame !== undefined) {
			window.cancelAnimationFrame(this.initialRefreshFrame);
			this.initialRefreshFrame = undefined;
		}
		window.clearTimeout(this.rebuildTimer);
	}
}
