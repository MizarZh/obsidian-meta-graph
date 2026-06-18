import { TFile, type App } from 'obsidian';
import { MetadataIndexer } from '../core/metadata-indexer';
import { normalizePath } from '../core/knowledge-index';
import type {
	DebugSnapshot,
	GraphQuery,
	KnowledgeIndex,
	MetadataDebugEntry,
	NodeId,
	RendererDebugState,
	UnresolvedLink,
	ViewMode,
	WorkspaceState,
} from '../core/types';
import { GraphQueryEngine } from '../query/neighborhood';
import { createWorkspaceState } from './workspace-state';

type StateListener = (state: WorkspaceState) => void;

export class WorkspaceController {
	private state: WorkspaceState;
	private index?: KnowledgeIndex;
	private readonly queryEngine = new GraphQueryEngine();
	private readonly listeners = new Set<StateListener>();
	private unresolvedLinks: UnresolvedLink[] = [];
	private metadataSources: MetadataDebugEntry[] = [];
	private rendererDebugState: RendererDebugState = { status: 'idle' };
	private rebuildTimer?: number;
	private destroyed = false;

	constructor(
		private readonly app: App,
		maxNodes: number,
		private readonly debug: boolean,
	) {
		this.state = createWorkspaceState(maxNodes);
	}

	get snapshot(): WorkspaceState {
		return this.state;
	}

	getDebugSnapshot(state: WorkspaceState = this.state): DebugSnapshot {
		return {
			generatedAt: new Date().toISOString(),
			index: {
				nodeCount: this.index?.nodes.size ?? 0,
				edgeCount: this.index?.edges.size ?? 0,
				nodes: [...(this.index?.nodes.values() ?? [])],
				edges: [...(this.index?.edges.values() ?? [])],
				outgoing: mapSetsToRecord(this.index?.outgoing),
				incoming: mapSetsToRecord(this.index?.incoming),
			},
			state: {
				...state,
				projection: state.projection
					? {
							...state.projection,
							rootIds: [...state.projection.rootIds],
						}
					: undefined,
			},
			unresolvedLinks: this.unresolvedLinks,
			metadataSources: this.metadataSources,
			renderer: this.rendererDebugState,
		};
	}

	setRendererDebugState(rendererDebugState: RendererDebugState): void {
		this.rendererDebugState = rendererDebugState;
		this.emit();
	}

	subscribe(listener: StateListener): () => void {
		this.listeners.add(listener);
		listener(this.state);
		return () => this.listeners.delete(listener);
	}

	initialize(initialFile: TFile | null): void {
		this.setCurrentFile(initialFile);
		this.refresh();
	}

	scheduleRefresh(): void {
		window.clearTimeout(this.rebuildTimer);
		this.rebuildTimer = window.setTimeout(() => this.refresh(), 300);
	}

	refresh(): void {
		if (this.destroyed) {
			return;
		}
		const indexer = new MetadataIndexer(this.app, this.debug);
		this.index = indexer.build();
		this.unresolvedLinks = [...indexer.unresolvedLinks];
		this.metadataSources = [...indexer.metadataSources];
		this.state = {
			...this.state,
			availableFolders: uniqueSorted(
				[...this.index.nodes.values()]
					.map((node) => node.folder)
					.filter(Boolean),
			),
			availableDomains: uniqueSorted(
				[...this.index.nodes.values()].flatMap((node) => node.domains),
			),
		};
		this.runQuery();
	}

	setCurrentFile(file: TFile | null): void {
		if (!file) {
			return;
		}
		const currentNoteId = normalizePath(file.path);
		if (currentNoteId === this.state.currentNoteId) {
			return;
		}
		this.state = { ...this.state, currentNoteId };
		this.emit();
	}

	setMode(mode: ViewMode): void {
		this.state = { ...this.state, mode };
		this.emit();
	}

	updateQuery(patch: Partial<Omit<GraphQuery, 'roots'>>): void {
		this.state = {
			...this.state,
			query: { ...this.state.query, ...patch },
		};
		this.runQuery();
	}

	selectNode(selectedNodeId?: NodeId): void {
		this.state = { ...this.state, selectedNodeId };
		this.emit();
	}

	hoverNode(hoveredNodeId?: NodeId): void {
		this.state = { ...this.state, hoveredNodeId };
		this.emit();
	}

	async openNode(nodeId: NodeId): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(nodeId);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf('tab').openFile(file);
		}
	}

	dispose(): void {
		this.destroyed = true;
		window.clearTimeout(this.rebuildTimer);
		this.listeners.clear();
	}

	private runQuery(): void {
		if (!this.index || this.destroyed) {
			return;
		}
		const projection = this.queryEngine.project(this.index, this.state.query);
		const selectedNodeId =
			this.state.selectedNodeId &&
			projection.nodes.some((node) => node.id === this.state.selectedNodeId)
				? this.state.selectedNodeId
				: undefined;
		this.state = { ...this.state, projection, selectedNodeId };
		this.emit();
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener(this.state);
		}
	}
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function mapSetsToRecord(
	map: Map<string, Set<string>> | undefined,
): Record<string, string[]> {
	return Object.fromEntries(
		[...(map?.entries() ?? [])].map(([key, values]) => [key, [...values]]),
	);
}
