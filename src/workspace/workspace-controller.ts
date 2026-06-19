import { TFile, type App } from 'obsidian';
import { MetadataIndexer } from '../core/metadata-indexer';
import { normalizePath } from '../core/knowledge-index';
import type {
	DebugSnapshot,
	FlowDirection,
	FlowEdgeStyle,
	GraphQuery,
	KnowledgeIndex,
	LinkStyleRule,
	MetaGraphChart,
	MetaGraphDocument,
	MetadataDebugEntry,
	NodeId,
	NodeStyleRule,
	RendererDebugState,
	UnresolvedLink,
	ViewMode,
	WorkspaceState,
} from '../core/types';
import { GraphQueryEngine } from '../query/neighborhood';
import { createWorkspaceState } from './workspace-state';
import {
	createDefaultChart,
	serializeMetaGraphState,
} from './meta-graph-model';
import { cloneSerializable } from './workspace-persistence';

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
		fadeDistance = 1.5,
		document?: MetaGraphDocument,
	) {
		this.state = createWorkspaceState(maxNodes, fadeDistance, document);
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
		this.rebuildTimer = window.setTimeout(() => this.refresh(false), 300);
	}

	refresh(forceLayout = false): void {
		if (this.destroyed) {
			return;
		}
		const indexer = new MetadataIndexer(this.app, this.debug);
		this.index = indexer.build();
		this.unresolvedLinks = [...indexer.unresolvedLinks];
		this.metadataSources = [...indexer.metadataSources];
		this.state = {
			...this.state,
			layoutRevision:
				this.state.layoutRevision + (forceLayout ? 1 : 0),
			availableFolders: uniqueSorted(
				[...this.index.nodes.values()]
					.map((node) => node.folder)
					.filter(Boolean),
			),
			availableTags: uniqueSorted(
				[...this.index.nodes.values()].flatMap((node) => node.tags),
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

	setActiveChart(activeChartId: string): void {
		const chart = this.state.charts.find((item) => item.id === activeChartId);
		if (!chart || chart.id === this.state.activeChartId) {
			return;
		}
		const nextState = createWorkspaceState(
			this.state.query.maxNodes,
			chart.display.fadeDistance,
			{
				charts: this.state.charts,
				activeChart: chart.id,
			},
		);
		this.state = {
			...nextState,
			currentNoteId: this.state.currentNoteId,
			layoutRevision: this.state.layoutRevision + 1,
			availableFolders: this.state.availableFolders,
			availableTags: this.state.availableTags,
			availableDomains: this.state.availableDomains,
		};
		this.runQuery();
	}

	addChart(type: ViewMode): void {
		const chart = createDefaultChart(
			type,
			this.state.query.maxNodes,
			this.state.fadeDistance,
			this.state.charts,
		);
		this.state = {
			...this.state,
			charts: [...this.state.charts, chart],
		};
		this.setActiveChart(chart.id);
	}

	deleteActiveChart(): void {
		if (this.state.charts.length <= 1) {
			return;
		}
		const charts = this.state.charts.filter(
			(chart) => chart.id !== this.state.activeChartId,
		);
		const nextActiveChart = charts[0];
		if (!nextActiveChart) {
			return;
		}
		this.state = {
			...this.state,
			charts,
		};
		this.setActiveChart(nextActiveChart.id);
	}

	setFlowEdgeStyle(flowEdgeStyle: FlowEdgeStyle): void {
		this.state = this.updateActiveChart({
			layout: {
				...this.getActiveChart().layout,
				edgeStyle: flowEdgeStyle,
			},
		});
		this.emit();
	}

	setFlowDirection(flowDirection: FlowDirection): void {
		this.state = this.updateActiveChart({
			layout: {
				...this.getActiveChart().layout,
				direction: flowDirection,
			},
		});
		this.emit();
	}

	setFadeDistance(fadeDistance: number): void {
		this.state = this.updateActiveChart({
			display: {
				...this.getActiveChart().display,
				fadeDistance,
			},
		});
		this.emit();
	}

	setGraphSpacing(graphSpacing: number): void {
		this.state = this.updateActiveChart(
			{
				layout: {
					...this.getActiveChart().layout,
					spacing: graphSpacing,
				},
			},
			true,
		);
		this.emit();
	}

	setFlowSpacing(flowSpacing: number): void {
		this.state = this.updateActiveChart(
			{
				layout: {
					...this.getActiveChart().layout,
					spacing: flowSpacing,
				},
			},
			true,
		);
		this.emit();
	}

	getDocument(): MetaGraphDocument {
		return serializeMetaGraphState(this.state);
	}

	updateQuery(patch: Partial<Omit<GraphQuery, 'roots'>>): void {
		this.state = this.updateActiveChart({
			query: { ...this.state.query, ...patch },
		});
		this.runQuery();
	}

	setNodeStyleRules(nodeStyleRules: NodeStyleRule[]): void {
		this.state = this.updateActiveChart({
			style: {
				...this.getActiveChart().style,
				nodeRules: nodeStyleRules,
			},
		});
		this.emit();
	}

	setLinkStyleRules(linkStyleRules: LinkStyleRule[]): void {
		this.state = this.updateActiveChart({
			style: {
				...this.getActiveChart().style,
				linkRules: linkStyleRules,
			},
		});
		this.emit();
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

	private getActiveChart(): MetaGraphChart {
		const chart = this.state.charts.find(
			(item) => item.id === this.state.activeChartId,
		);
		if (!chart) {
			throw new Error('Active chart is missing from workspace state.');
		}
		return chart;
	}

	private updateActiveChart(
		patch: Partial<MetaGraphChart>,
		forceLayout = false,
	): WorkspaceState {
		const activeChart = this.getActiveChart();
		const nextChart = cloneSerializable({
			...activeChart,
			...patch,
			query: patch.query ?? activeChart.query,
			layout: patch.layout ?? activeChart.layout,
			display: patch.display ?? activeChart.display,
			style: patch.style ?? activeChart.style,
		});
		return {
			...this.state,
			charts: this.state.charts.map((chart) =>
				chart.id === nextChart.id ? nextChart : chart,
			),
			mode: nextChart.type,
			flowEdgeStyle: nextChart.layout.edgeStyle ?? 'orthogonal',
			flowDirection: nextChart.layout.direction ?? 'LR',
			fadeDistance: nextChart.display.fadeDistance,
			graphSpacing:
				nextChart.type === 'graph'
					? nextChart.layout.spacing
					: this.state.graphSpacing,
			flowSpacing:
				nextChart.type === 'flow'
					? nextChart.layout.spacing
					: this.state.flowSpacing,
			query: cloneSerializable(nextChart.query),
			nodeStyleRules: cloneSerializable(nextChart.style.nodeRules),
			linkStyleRules: cloneSerializable(nextChart.style.linkRules),
			layoutRevision:
				this.state.layoutRevision + (forceLayout ? 1 : 0),
		};
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
