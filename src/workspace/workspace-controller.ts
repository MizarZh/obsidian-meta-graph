import { TFile, type App } from 'obsidian';
import { MetadataIndexer } from '../core/metadata-indexer';
import { normalizePath } from '../core/knowledge-index';
import { extractLinkText } from '../core/link-resolver';
import type {
	ArcDirection,
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
	normalizeConnectionFields,
	normalizeLinkStyleRules,
	normalizeNodeStyleRules,
	serializeMetaGraphState,
} from './meta-graph-model';
import { cloneSerializable } from './workspace-persistence';

type StateListener = (state: WorkspaceState) => void;

interface ConnectionUndoEntry {
	sourcePath: string;
	field: string;
	link: string;
	hadField: boolean;
	previousValue: unknown;
}

export class WorkspaceController {
	private state: WorkspaceState;
	private index?: KnowledgeIndex;
	private readonly queryEngine = new GraphQueryEngine();
	private readonly listeners = new Set<StateListener>();
	private unresolvedLinks: UnresolvedLink[] = [];
	private metadataSources: MetadataDebugEntry[] = [];
	private rendererDebugState: RendererDebugState = { status: 'idle' };
	private rebuildTimer?: number;
	private readonly connectionUndoStack: ConnectionUndoEntry[] = [];
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
		const indexer = new MetadataIndexer(
			this.app,
			this.debug,
			this.state.connectionFields,
		);
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
				connectionFields: this.state.connectionFields,
				activeConnectionField: this.state.activeConnectionField,
			},
		);
		this.state = {
			...nextState,
			currentNoteId: this.state.currentNoteId,
			layoutRevision: this.state.layoutRevision + 1,
			availableFolders: this.state.availableFolders,
			availableTags: this.state.availableTags,
			availableDomains: this.state.availableDomains,
			connectionFields: this.state.connectionFields,
			activeConnectionField: this.state.activeConnectionField,
			connectionUndoCount: this.state.connectionUndoCount,
		};
		this.runQuery();
	}

	addChart(): void {
		const chart = createDefaultChart(
			'graph',
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

	setActiveChartName(name: string): void {
		const normalized = name.trim();
		if (!normalized) {
			return;
		}
		this.state = this.updateActiveChart({ name: normalized });
		this.emit();
	}

	setActiveChartType(type: ViewMode): void {
		const activeChart = this.getActiveChart();
		if (activeChart.type === type) {
			return;
		}
		const defaultChart = createDefaultChart(
			type,
			this.state.query.maxNodes,
			this.state.fadeDistance,
			this.state.charts.filter((chart) => chart.id !== activeChart.id),
		);
		this.state = this.updateActiveChart(
			{
				type,
				layout: defaultChart.layout,
			},
			true,
		);
		this.runQuery();
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

	setArcDirection(arcDirection: ArcDirection): void {
		this.state = this.updateActiveChart(
			{
				layout: {
					...this.getActiveChart().layout,
					arcDirection,
				},
			},
			true,
		);
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
				nodeRules: normalizeNodeStyleRules(nodeStyleRules),
			},
		});
		this.emit();
	}

	setLinkStyleRules(linkStyleRules: LinkStyleRule[]): void {
		this.state = this.updateActiveChart({
			style: {
				...this.getActiveChart().style,
				linkRules: normalizeLinkStyleRules(linkStyleRules),
			},
		});
		this.emit();
	}

	setActiveConnectionField(field: string): void {
		const normalized = field.trim();
		if (!normalized) {
			return;
		}
		const connectionFields = normalizeConnectionFields([
			...this.state.connectionFields,
			normalized,
		]);
		const activeChart = this.getActiveChart();
		const relations = activeChart.query.relations.includes(normalized)
			? activeChart.query.relations
			: [...activeChart.query.relations, normalized];
		const nextState = this.updateActiveChart({
			query: {
				...activeChart.query,
				relations,
			},
		});
		this.state = {
			...nextState,
			connectionFields,
			activeConnectionField: normalized,
		};
		this.runQuery();
	}

	addConnectionField(field: string): void {
		this.setActiveConnectionField(field);
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

	async connectNodes(
		sourceNodeId: NodeId,
		targetNodeId: NodeId,
		field = this.state.activeConnectionField,
	): Promise<void> {
		const normalizedField = field.trim();
		if (!normalizedField || sourceNodeId === targetNodeId) {
			return;
		}
		const sourceFile = this.app.vault.getAbstractFileByPath(sourceNodeId);
		const targetFile = this.app.vault.getAbstractFileByPath(targetNodeId);
		if (!(sourceFile instanceof TFile) || !(targetFile instanceof TFile)) {
			return;
		}

		this.setActiveConnectionField(normalizedField);
		const link = this.app.fileManager.generateMarkdownLink(
			targetFile,
			sourceFile.path,
		);
		let undo: ConnectionUndoEntry | undefined;
		await this.app.fileManager.processFrontMatter(sourceFile, (frontmatter) => {
			const hadField = Object.prototype.hasOwnProperty.call(
				frontmatter,
				normalizedField,
			);
			const currentValue = frontmatter[normalizedField];
			const currentValues = toFrontmatterArray(currentValue);
			if (
				currentValues.some((value) =>
					this.frontmatterValueLinksToTarget(
						value,
						sourceFile.path,
						targetFile.path,
					),
				)
			) {
				return;
			}
			undo = {
				sourcePath: sourceFile.path,
				field: normalizedField,
				link,
				hadField,
				previousValue: cloneFrontmatterValue(currentValue),
			};
			frontmatter[normalizedField] = [...currentValues, link];
		});
		if (undo) {
			this.connectionUndoStack.push(undo);
			this.updateConnectionUndoCount();
			this.scheduleRefresh();
		}
	}

	async undoLastConnection(): Promise<void> {
		while (this.connectionUndoStack.length > 0) {
			const undo = this.connectionUndoStack.pop();
			if (!undo) {
				break;
			}
			const sourceFile = this.app.vault.getAbstractFileByPath(undo.sourcePath);
			if (!(sourceFile instanceof TFile)) {
				continue;
			}

			let changed = false;
			await this.app.fileManager.processFrontMatter(sourceFile, (frontmatter) => {
				const currentValue = frontmatter[undo.field];
				const currentValues = toFrontmatterArray(currentValue);
				const remainingValues = currentValues.filter(
					(value) => !frontmatterValueEquals(value, undo.link),
				);
				if (remainingValues.length === currentValues.length) {
					return;
				}

				const previousValues = toFrontmatterArray(undo.previousValue);
				if (undo.hadField && valuesEqual(remainingValues, previousValues)) {
					frontmatter[undo.field] = undo.previousValue;
				} else if (!undo.hadField && remainingValues.length === 0) {
					delete frontmatter[undo.field];
				} else {
					frontmatter[undo.field] = remainingValues;
				}
				changed = true;
			});
			this.updateConnectionUndoCount();
			if (changed) {
				this.scheduleRefresh();
				return;
			}
		}
		this.updateConnectionUndoCount();
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

	private updateConnectionUndoCount(): void {
		const connectionUndoCount = this.connectionUndoStack.length;
		if (this.state.connectionUndoCount === connectionUndoCount) {
			return;
		}
		this.state = { ...this.state, connectionUndoCount };
		this.emit();
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
			arcDirection: nextChart.layout.arcDirection ?? 'right',
			fadeDistance: nextChart.display.fadeDistance,
			graphSpacing:
				nextChart.type === 'graph'
					? nextChart.layout.spacing
					: this.state.graphSpacing,
			flowSpacing:
				nextChart.type === 'flow'
					? nextChart.layout.spacing
					: this.state.flowSpacing,
			arcSpacing:
				nextChart.type === 'arc'
					? nextChart.layout.spacing
					: this.state.arcSpacing,
			query: cloneSerializable(nextChart.query),
			nodeStyleRules: cloneSerializable(nextChart.style.nodeRules),
			linkStyleRules: cloneSerializable(nextChart.style.linkRules),
			layoutRevision:
				this.state.layoutRevision + (forceLayout ? 1 : 0),
		};
	}

	private frontmatterValueLinksToTarget(
		value: unknown,
		sourcePath: string,
		targetPath: string,
	): boolean {
		if (typeof value !== 'string') {
			return false;
		}
		const linkText = extractLinkText(value);
		const resolved = this.app.metadataCache.getFirstLinkpathDest(
			linkText,
			sourcePath,
		);
		return normalizePath(resolved?.path ?? linkText) === normalizePath(targetPath);
	}
}

function toFrontmatterArray(value: unknown): unknown[] {
	if (Array.isArray(value)) {
		return value;
	}
	return value === undefined || value === null ? [] : [value];
}

function cloneFrontmatterValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => cloneFrontmatterValue(item));
	}
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				cloneFrontmatterValue(item),
			]),
		);
	}
	return value;
}

function frontmatterValueEquals(value: unknown, expected: string): boolean {
	return typeof value === 'string' && value.trim() === expected.trim();
}

function valuesEqual(left: unknown[], right: unknown[]): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
