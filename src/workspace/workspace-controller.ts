import { TFile, TFolder, type App } from 'obsidian';
import { MetadataIndexer } from '../core/metadata-indexer';
import { normalizePath } from '../core/knowledge-index';
import { extractLinkText } from '../core/link-resolver';
import type {
	ArcDirection,
	ChartLayoutConfig,
	ChartSource,
	ChartGroup,
	ConnectionFieldMode,
	ConnectionFieldSpec,
	CuratedWorkspaceConfig,
	DefaultLinkStyle,
	DefaultNodeStyle,
	DebugSnapshot,
	FlowDirection,
	FlowEdgeStyle,
	GraphQuery,
	GraphProjection,
	KnowledgeIndex,
	LabelPosition,
	LinkStyleRule,
	MetaGraphChart,
	MetaGraphDocument,
	DockConnectionDirection,
	DockTemplateNode,
	MetadataDebugEntry,
	NodeId,
	NodeStyleRule,
	RendererDebugState,
	UnresolvedLink,
	ViewMode,
	WorkspaceState,
} from '../core/types';
import { CuratedProjectionEngine } from '../query/curated';
import { GraphQueryEngine } from '../query/neighborhood';
import {
	addCuratedFilePaths,
	removeCuratedFilePaths,
	renameCuratedFilePath,
} from './curated-workspace';
import { createWorkspaceState } from './workspace-state';
import {
	createDefaultCuratedWorkspace,
	createDefaultChart,
	createConnectionFieldSpec,
	DEFAULT_CONNECTION_FIELD_MODE,
	normalizeConnectionFieldSpecs,
	normalizeConnectionFieldModes,
	normalizeCuratedWorkspace,
	normalizeConnectionFields,
	normalizeDockNotes,
	normalizeDockTemplates,
	normalizeGlobalLinkStyleRules,
	normalizeGlobalNodeStyleRules,
	normalizeLinkStyleRules,
	normalizeNodeStyleRules,
	serializeMetaGraphState,
} from './meta-graph-model';
import { cloneSerializable } from './workspace-persistence';

type StateListener = (state: WorkspaceState) => void;

interface ConnectionUndoChange {
	sourcePath: string;
	field: string;
	link: string;
	hadField: boolean;
	previousValue: unknown;
}

type ConnectionUndoEntry = ConnectionUndoChange[];

export class WorkspaceController {
	private state: WorkspaceState;
	private index?: KnowledgeIndex;
	private readonly queryEngine = new GraphQueryEngine();
	private readonly curatedEngine = new CuratedProjectionEngine();
	private readonly listeners = new Set<StateListener>();
	private unresolvedLinks: UnresolvedLink[] = [];
	private metadataSources: MetadataDebugEntry[] = [];
	private rendererDebugState: RendererDebugState = { status: 'idle' };
	private rebuildTimer?: number;
	private pendingRefreshForceLayout = false;
	private readonly connectionUndoStack: ConnectionUndoEntry[] = [];
	private destroyed = false;

	constructor(
		private readonly app: App,
		maxNodes: number,
		private readonly debug: boolean,
		private relayoutFlowAfterConnection: boolean,
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
							primaryIds: state.projection.primaryIds
								? [...state.projection.primaryIds]
								: undefined,
							contextIds: state.projection.contextIds
								? [...state.projection.contextIds]
								: undefined,
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

	setRelayoutFlowAfterConnection(value: boolean): void {
		this.relayoutFlowAfterConnection = value;
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

	scheduleRefresh(forceLayout = false): void {
		this.pendingRefreshForceLayout ||= forceLayout;
		window.clearTimeout(this.rebuildTimer);
		this.rebuildTimer = window.setTimeout(() => {
			const shouldForceLayout = this.pendingRefreshForceLayout;
			this.pendingRefreshForceLayout = false;
			this.refresh(shouldForceLayout);
		}, 300);
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
			availableFolders: readVaultFolders(this.app),
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
						globalQuery: this.state.globalQuery,
						globalStyle: {
							defaultNodeStyle: this.state.defaultNodeStyle,
							defaultLinkStyle: this.state.defaultLinkStyle,
							nodeRules: this.state.globalNodeStyleRules,
							linkRules: this.state.globalLinkStyleRules,
						},
					activeChart: chart.id,
					connectionFields: this.state.connectionFields,
					connectionFieldSpecs: this.state.connectionFieldSpecs,
					connectionFieldModes: this.state.connectionFieldModes,
					activeConnectionFieldSpecId:
						this.state.activeConnectionFieldSpecId,
					activeConnectionField: this.state.activeConnectionField,
					dock: this.state.dock,
				},
			);
		this.state = {
			...nextState,
			currentNoteId: this.state.currentNoteId,
			layoutRevision: this.state.layoutRevision + 1,
			availableFolders: this.state.availableFolders,
			availableTags: this.state.availableTags,
			availableDomains: this.state.availableDomains,
			globalQuery: this.state.globalQuery,
			globalNodeStyleRules: this.state.globalNodeStyleRules,
			globalLinkStyleRules: this.state.globalLinkStyleRules,
			connectionFields: this.state.connectionFields,
			connectionFieldSpecs: this.state.connectionFieldSpecs,
			connectionFieldModes: this.state.connectionFieldModes,
			activeConnectionFieldSpecId: this.state.activeConnectionFieldSpecId,
			activeConnectionField: this.state.activeConnectionField,
			dock: this.state.dock,
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
		const layout =
			type === 'cube'
				? normalizeCubeLayout(
						defaultChart.layout,
						this.state.projection?.nodes.map((node) => node.id) ?? [],
					)
				: defaultChart.layout;
		this.state = this.updateActiveChart(
			{
				type,
				layout,
			},
			true,
		);
		this.runQuery();
	}

	setActiveChartSource(source: ChartSource): void {
		const activeChart = this.getActiveChart();
		if (activeChart.source === source) {
			return;
		}
		this.state = this.updateActiveChart({
			source,
			curated: activeChart.curated ?? createDefaultCuratedWorkspace(),
		});
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
		if (this.getActiveChart().display.fadeDistance === fadeDistance) {
			return;
		}
		this.state = this.updateActiveChart({
			display: {
				...this.getActiveChart().display,
				fadeDistance,
			},
		});
		this.emit();
	}

	setLabelSize(labelSize: number): void {
		if (this.getActiveChart().display.labelSize === labelSize) {
			return;
		}
		this.state = this.updateActiveChart({
			display: {
				...this.getActiveChart().display,
				labelSize,
			},
		});
		this.emit();
	}

	setLabelPosition(labelPosition: LabelPosition): void {
		this.state = this.updateActiveChart({
			display: {
				...this.getActiveChart().display,
				labelPosition,
			},
		});
		this.emit();
	}

	setLabelColor(labelColor: string): void {
		this.state = this.updateActiveChart({
			display: {
				...this.getActiveChart().display,
				labelColor,
			},
		});
		this.emit();
	}

	setLabelBackgroundOpacity(labelBackgroundOpacity: number): void {
		if (
			this.getActiveChart().display.labelBackgroundOpacity ===
			labelBackgroundOpacity
		) {
			return;
		}
		this.state = this.updateActiveChart({
			display: {
				...this.getActiveChart().display,
				labelBackgroundOpacity,
			},
		});
		this.emit();
	}

	setLabelDensity(labelDensity: number): void {
		const density = Math.max(0, Math.min(1, labelDensity));
		if (this.getActiveChart().display.labelDensity === density) {
			return;
		}
		this.state = this.updateActiveChart({
			display: {
				...this.getActiveChart().display,
				labelDensity: density,
			},
		});
		this.emit();
	}

	setCubeFaceOpacity(cubeFaceOpacity: number): void {
		const opacity = Math.max(0.05, Math.min(1, cubeFaceOpacity));
		if (this.getActiveChart().display.cubeFaceOpacity === opacity) {
			return;
		}
		this.state = this.updateActiveChart({
			display: {
				...this.getActiveChart().display,
				cubeFaceOpacity: opacity,
			},
		});
		this.emit();
	}

	setForceLabels(forceLabels: boolean): void {
		if (this.getActiveChart().display.forceLabels === forceLabels) {
			return;
		}
		this.state = this.updateActiveChart({
			display: {
				...this.getActiveChart().display,
				forceLabels,
			},
		});
		this.emit();
	}

	setEnableForceLayout(enableForceLayout: boolean): void {
		if (this.getActiveChart().display.enableForceLayout === enableForceLayout) {
			return;
		}
		this.state = this.updateActiveChart({
			display: {
				...this.getActiveChart().display,
				enableForceLayout,
			},
		});
		this.emit();
	}

	setManualNodePosition(
		nodeId: NodeId,
		position: { x: number; y: number },
		groupId?: string,
	): void {
		const activeChart = this.getActiveChart();
		const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
		const previous = manual.nodes[nodeId];
		const nextPlacement = groupId
			? { x: position.x, y: position.y, groupId }
			: { x: position.x, y: position.y };
		if (
			previous?.x === nextPlacement.x &&
			previous?.y === nextPlacement.y &&
			previous?.groupId === nextPlacement.groupId
		) {
			return;
		}
		this.state = this.updateActiveChart({
			layout: {
				...activeChart.layout,
				manual: {
					...manual,
					nodes: {
						...manual.nodes,
						[nodeId]: nextPlacement,
					},
				},
			},
		});
		this.emit();
	}

	addGroup(): void {
		const activeChart = this.getActiveChart();
		if (activeChart.type === 'cube') {
			return;
		}
		const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
		const group = createUniqueDefaultGroup(manual.groups);
		this.state = this.updateActiveChart({
			layout: {
				...activeChart.layout,
				manual: {
					...manual,
					groups: [...manual.groups, group],
				},
			},
		});
		this.emit();
	}

	updateGroup(groupId: string, patch: Partial<ChartGroup>): void {
		const activeChart = this.getActiveChart();
		const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
		const groups = manual.groups.map((group) =>
			group.id === groupId ? normalizeGroupPatch(group, patch) : group,
		);
		this.state = this.updateActiveChart({
			layout: {
				...activeChart.layout,
				manual: {
					...manual,
					groups,
				},
			},
		});
		this.emit();
	}

	moveGroup(groupId: string, delta: { x: number; y: number }): void {
		if (delta.x === 0 && delta.y === 0) {
			return;
		}
		const activeChart = this.getActiveChart();
		const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
		const groups = manual.groups.map((group) =>
			group.id === groupId
				? {
						...group,
						x: group.x + delta.x,
						y: group.y + delta.y,
					}
				: group,
		);
		const nodes = Object.fromEntries(
			Object.entries(manual.nodes).map(([nodeId, placement]) => [
				nodeId,
				placement.groupId === groupId
					? {
							...placement,
							x: placement.x + delta.x,
							y: placement.y + delta.y,
						}
					: placement,
			]),
		);
		this.state = this.updateActiveChart({
			layout: {
				...activeChart.layout,
				manual: {
					...manual,
					nodes,
					groups,
				},
			},
		});
		this.emit();
	}

	resizeGroup(
		groupId: string,
		geometry: Pick<ChartGroup, 'x' | 'y' | 'width' | 'height'>,
	): void {
		this.updateGroup(groupId, geometry);
	}

	moveCuratedFilesToGroup(paths: NodeId[], groupId?: string): void {
		if (paths.length === 0) {
			return;
		}
		const activeChart = this.getActiveChart();
		const layout = moveManualNodesToGroup(activeChart.layout, paths, groupId);
		if (layout === activeChart.layout) {
			return;
		}
		this.state = this.updateActiveChart({ layout }, true);
		this.emit();
	}

	private placeTemplateNoteInDefaultGroup(
		path: NodeId,
		groupId?: string,
	): void {
		if (!groupId) {
			return;
		}
		const group = this.getActiveChart().layout.manual?.groups.find(
			(item) => item.id === groupId,
		);
		if (!group) {
			return;
		}
		this.setManualNodePosition(
			path,
			{
				x: group.x + group.width / 2,
				y: group.y + group.height / 2,
			},
			group.id,
		);
	}

	deleteGroup(groupId: string): void {
		const activeChart = this.getActiveChart();
		if (activeChart.type === 'cube') {
			return;
		}
		const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
		const groups = manual.groups.filter((group) => group.id !== groupId);
		const nodes = Object.fromEntries(
			Object.entries(manual.nodes).map(([nodeId, placement]) => [
				nodeId,
				placement.groupId === groupId
					? { x: placement.x, y: placement.y }
					: placement,
			]),
		);
		this.state = this.updateActiveChart({
			layout: {
				...activeChart.layout,
				manual: {
					...manual,
					nodes,
					groups,
				},
			},
		});
		this.emit();
	}

	setGraphSpacing(graphSpacing: number): void {
		const spacing = normalizeSpacing(graphSpacing);
		if (this.getActiveChart().layout.spacing === spacing) {
			return;
		}
		this.state = this.updateActiveChart(
			{
				layout: {
					...this.getActiveChart().layout,
					spacing,
				},
			},
		);
		this.emit();
	}

	setGraphCenterForce(centerForce: number): void {
		this.setGraphForceSetting('centerForce', centerForce);
	}

	setGraphRepelForce(repelForce: number): void {
		this.setGraphForceSetting('repelForce', repelForce);
	}

	setGraphLinkForce(linkForce: number): void {
		this.setGraphForceSetting('linkForce', linkForce);
	}

	setGraphDragLinkForce(dragLinkForce: number): void {
		this.setGraphForceSetting('dragLinkForce', dragLinkForce);
	}

	setGraphReturnForce(returnForce: number): void {
		this.setGraphForceSetting('returnForce', returnForce);
	}

	setGraphLinkDistance(linkDistance: number): void {
		this.setGraphForceSetting('linkDistance', linkDistance);
	}

	setFlowSpacing(flowSpacing: number): void {
		const spacing = normalizeSpacing(flowSpacing);
		if (this.getActiveChart().layout.spacing === spacing) {
			return;
		}
		this.state = this.updateActiveChart(
			{
				layout: {
					...this.getActiveChart().layout,
					spacing,
				},
			},
			true,
		);
		this.emit();
	}

	setArcSpacing(arcSpacing: number): void {
		const spacing = normalizeSpacing(arcSpacing);
		if (this.getActiveChart().layout.spacing === spacing) {
			return;
		}
		this.state = this.updateActiveChart(
			{
				layout: {
					...this.getActiveChart().layout,
					spacing,
				},
			},
			true,
		);
		this.emit();
	}

	addCuratedFile(path: NodeId, groupId?: string): void {
		this.addCuratedFiles([path], groupId);
	}

	addCuratedFiles(paths: NodeId[], groupId?: string): void {
		const activeChart = this.getActiveChart();
		const update = addCuratedFilePaths(activeChart.curated, paths);
		if (!update.changed) {
			return;
		}
		const layout = addManualPlacements(
			activeChart.layout,
			activeChart.curated.files.map((file) => file.path),
			update.curated.files.map((file) => file.path),
			groupId,
		);
		this.state = this.updateActiveChart(
			{ curated: update.curated, layout },
			true,
		);
		this.runQuery();
	}

	removeCuratedFile(path: NodeId): void {
		this.removeCuratedFiles([path]);
	}

	removeCuratedFiles(paths: NodeId[]): void {
		const activeChart = this.getActiveChart();
		const update = removeCuratedFilePaths(activeChart.curated, paths);
		if (!update.changed) {
			return;
		}
		this.state = this.updateActiveChart({ curated: update.curated }, true);
		this.runQuery();
	}

	reorderCuratedFile(
		path: NodeId,
		targetPath: NodeId,
		placement: ReorderPlacement,
	): void {
		const activeChart = this.getActiveChart();
		const files = moveRelative(
			activeChart.curated.files,
			(file) => file.path === path,
			(file) => file.path === targetPath,
			placement,
		);
		if (files === activeChart.curated.files) {
			return;
		}
		const curated = normalizeCuratedWorkspace({
			...activeChart.curated,
			files,
		});
		this.state = this.updateActiveChart({ curated });
		this.runQuery();
	}

	clearCuratedFiles(): void {
		const activeChart = this.getActiveChart();
		if (activeChart.curated.files.length === 0) {
			return;
		}
		this.state = this.updateActiveChart(
			{
				curated: normalizeCuratedWorkspace({
					...activeChart.curated,
					files: [],
				}),
			},
			true,
		);
		this.runQuery();
	}

	updateCuratedWorkspace(patch: Partial<CuratedWorkspaceConfig>): void {
		const activeChart = this.getActiveChart();
		const curated = normalizeCuratedWorkspace({
			...activeChart.curated,
			...patch,
		});
		this.state = this.updateActiveChart({ curated }, true);
		this.runQuery();
	}

	getDocument(): MetaGraphDocument {
		return serializeMetaGraphState(this.state);
	}

	addDockTemplate(
		template: Omit<DockTemplateNode, 'id'> & { id?: string },
	): void {
		const templates = normalizeDockTemplates([
			...this.state.dock.templates,
			{
				...template,
				id: template.id ?? createDockId('template', template.label),
			},
		]);
		this.state = {
			...this.state,
			dock: {
				...this.state.dock,
				templates,
			},
		};
		this.emit();
	}

	updateDockTemplate(
		templateId: string,
		patch: Omit<DockTemplateNode, 'id'>,
	): void {
		if (!this.state.dock.templates.some((template) => template.id === templateId)) {
			return;
		}
		const templates = normalizeDockTemplates(
			this.state.dock.templates.map((template) =>
				template.id === templateId
					? {
							...template,
							...patch,
							id: template.id,
						}
					: template,
			),
		);
		if (templates === this.state.dock.templates) {
			return;
		}
		this.state = {
			...this.state,
			dock: {
				...this.state.dock,
				templates,
			},
		};
		this.emit();
	}

	removeDockTemplate(templateId: string): void {
		const templates = this.state.dock.templates.filter(
			(template) => template.id !== templateId,
		);
		if (templates.length === this.state.dock.templates.length) {
			return;
		}
		this.state = {
			...this.state,
			dock: {
				...this.state.dock,
				templates,
			},
		};
		this.emit();
	}

	reorderDockTemplate(
		templateId: string,
		targetTemplateId: string,
		placement: ReorderPlacement,
	): void {
		const templates = moveRelative(
			this.state.dock.templates,
			(template) => template.id === templateId,
			(template) => template.id === targetTemplateId,
			placement,
		);
		if (templates === this.state.dock.templates) {
			return;
		}
		this.state = {
			...this.state,
			dock: {
				...this.state.dock,
				templates,
			},
		};
		this.emit();
	}

	addDockNote(path: NodeId): void {
		const notes = normalizeDockNotes([
			...this.state.dock.notes,
			{ id: createDockId('note', path), path },
		]);
		this.state = {
			...this.state,
			dock: {
				...this.state.dock,
				notes,
			},
		};
		this.emit();
	}

	setDockWidth(dockWidth: number): void {
		this.state = {
			...this.state,
			dock: { ...this.state.dock, dockWidth },
		};
		this.emit();
	}

	setCuratedPanelWidth(curatedPanelWidth: number): void {
		this.state = {
			...this.state,
			dock: { ...this.state.dock, curatedPanelWidth },
		};
		this.emit();
	}

	setDockFocusOnSelect(focusOnSelect: boolean): void {
		this.state = {
			...this.state,
			dock: { ...this.state.dock, focusOnSelect },
		};
		this.emit();
	}

	updateDockNotePath(oldPath: string, newPath: string): boolean {
		const normalizedOld = normalizePath(oldPath);
		const normalizedNew = normalizePath(newPath);
		if (normalizedOld === normalizedNew) {
			return false;
		}
		let changed = false;
		const notes = this.state.dock.notes.map((note) => {
			if (note.path !== normalizedOld) {
				return note;
			}
			changed = true;
			return { ...note, path: normalizedNew };
		});
		if (!changed) {
			return false;
		}
		this.state = {
			...this.state,
			dock: { ...this.state.dock, notes },
		};
		this.emit();
		return true;
	}

	updateCuratedFilePath(oldPath: string, newPath: string): boolean {
		const normalizedOld = normalizePath(oldPath);
		const normalizedNew = normalizePath(newPath);
		if (normalizedOld === normalizedNew) {
			return false;
		}
		let changed = false;
		const charts = this.state.charts.map((chart) => {
			const update = renameCuratedFilePath(
				chart.curated,
				normalizedOld,
				normalizedNew,
			);
			changed ||= update.changed;
			return update.changed ? { ...chart, curated: update.curated } : chart;
		});
		if (!changed) {
			return false;
		}
		const activeChart = charts.find(
			(chart) => chart.id === this.state.activeChartId,
		);
		this.state = {
			...this.state,
			charts,
			curated: cloneSerializable(activeChart?.curated ?? this.state.curated),
		};
		this.emit();
		return true;
	}

	removeDockNote(path: NodeId): void {
		const notes = this.state.dock.notes.filter((note) => note.path !== path);
		if (notes.length === this.state.dock.notes.length) {
			return;
		}
		this.state = {
			...this.state,
			dock: {
				...this.state.dock,
				notes,
			},
		};
		this.emit();
	}

	reorderDockNote(
		path: NodeId,
		targetPath: NodeId,
		placement: ReorderPlacement,
	): void {
		const notes = moveRelative(
			this.state.dock.notes,
			(note) => note.path === path,
			(note) => note.path === targetPath,
			placement,
		);
		if (notes === this.state.dock.notes) {
			return;
		}
		this.state = {
			...this.state,
			dock: {
				...this.state.dock,
				notes,
			},
		};
		this.emit();
	}

	async connectDockNote(
		notePath: NodeId,
		targetNodeId: NodeId,
		direction: DockConnectionDirection = 'from-graph-to-dock',
		field = this.state.activeConnectionField,
	): Promise<void> {
		const [sourceNodeId, targetPath] =
			direction === 'from-dock-to-graph'
				? [notePath, targetNodeId]
				: [targetNodeId, notePath];
		await this.connectNodes(sourceNodeId, targetPath, field);
	}

	async createNoteFromTemplate(
		templateId: string,
		targetNodeId: NodeId,
		name: string,
		direction: DockConnectionDirection = 'from-dock-to-graph',
		field = this.state.activeConnectionField,
	): Promise<string> {
		const template = this.state.dock.templates.find(
			(item) => item.id === templateId,
		);
		if (!template) {
			throw new Error('Template is missing.');
		}
		const title = name.trim();
		if (!title) {
			throw new Error('Note name is required.');
		}
		const folderPath = normalizePath(template.targetFolder);
		await this.ensureFolderPath(folderPath);
		const filePath = this.createAvailableMarkdownPath(folderPath, title);
		const content = await this.renderTemplateContent(template, title);
		const file = await this.app.vault.create(filePath, content);

		// Process with Templater if available
		const appRuntime = this.app as unknown as {
			plugins: { plugins: Record<string, { templater?: Record<string, unknown> } | undefined> };
		};
		const templaterPlugin = appRuntime.plugins.plugins['templater-obsidian'];
		if (templaterPlugin?.templater) {
			try {
				const templateFile = this.app.vault.getAbstractFileByPath(
					normalizePath(template.templatePath),
				);
				const templater = templaterPlugin.templater as unknown as {
					create_running_config(
						template_file: TFile | undefined,
						target_file: TFile,
						run_mode: number,
					): unknown;
					parse_template(
						config: unknown,
						content: string,
					): Promise<string>;
				};
				const config = templater.create_running_config(
					templateFile instanceof TFile ? templateFile : undefined,
					file,
					2, // RunMode.OverwriteFile
				);
				const processed = await templater.parse_template(config, content);
				await this.app.vault.modify(file, processed);
			} catch (error) {
				console.warn(
					'[Meta Graph] Templater processing failed, using fallback content.',
					error,
				);
			}
		}

			await this.connectDockNote(
				file.path,
				targetNodeId,
				direction,
				field,
			);
			this.placeTemplateNoteInDefaultGroup(file.path, template.defaultGroupId);
			return file.path;
		}

	updateQuery(patch: Partial<Omit<GraphQuery, 'roots'>>): void {
		this.state = this.updateActiveChart({
			query: { ...this.state.query, ...patch },
		});
		this.runQuery();
	}

	updateGlobalQuery(patch: Partial<Omit<GraphQuery, 'roots'>>): void {
		this.state = {
			...this.state,
			globalQuery: { ...this.state.globalQuery, ...patch, roots: [] },
		};
		this.runQuery();
	}

	setGlobalNodeStyleRules(nodeStyleRules: NodeStyleRule[]): void {
		this.state = {
			...this.state,
			globalNodeStyleRules: normalizeGlobalNodeStyleRules(nodeStyleRules),
		};
		this.emit();
	}

	setGlobalLinkStyleRules(linkStyleRules: LinkStyleRule[]): void {
		this.state = {
			...this.state,
			globalLinkStyleRules: normalizeGlobalLinkStyleRules(linkStyleRules),
		};
		this.emit();
	}

	setDefaultNodeStyle(defaultNodeStyle: Required<DefaultNodeStyle>): void {
		this.state = {
			...this.state,
			defaultNodeStyle: cloneSerializable(defaultNodeStyle),
		};
		this.emit();
	}

	setDefaultLinkStyle(defaultLinkStyle: Required<DefaultLinkStyle>): void {
		this.state = {
			...this.state,
			defaultLinkStyle: cloneSerializable(defaultLinkStyle),
		};
		this.emit();
	}

	setNodeStyleOverrides(nodeStyleOverrides: DefaultNodeStyle): void {
		this.state = this.updateActiveChart({
			style: {
				...this.getActiveChart().style,
				nodeOverrides: cloneSerializable(nodeStyleOverrides),
			},
		});
		this.emit();
	}

	setLinkStyleOverrides(linkStyleOverrides: DefaultLinkStyle): void {
		this.state = this.updateActiveChart({
			style: {
				...this.getActiveChart().style,
				linkOverrides: cloneSerializable(linkStyleOverrides),
			},
		});
		this.emit();
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
		const activeMode = this.getActiveConnectionMode();
		const activeSpec =
			findConnectionFieldSpec(
				this.state.connectionFieldSpecs,
				normalized,
				activeMode,
			) ?? this.state.connectionFieldSpecs.find((item) => item.field === normalized);
		const activeChart = this.getActiveChart();
		if (activeChart.source === 'curated') {
			this.state = {
				...this.state,
				activeConnectionFieldSpecId:
					activeSpec?.id ?? this.state.activeConnectionFieldSpecId,
				activeConnectionField: normalized,
			};
			this.emit();
			return;
		}
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
			activeConnectionFieldSpecId:
				activeSpec?.id ?? nextState.activeConnectionFieldSpecId,
			activeConnectionField: normalized,
		};
		this.runQuery();
	}

	addConnectionField(field: string): void {
		const normalized = field.trim();
		if (!normalized) {
			return;
		}
		const mode = this.getActiveConnectionMode();
		const connectionFieldSpecs = normalizeConnectionFieldSpecs([
			...this.state.connectionFieldSpecs,
			createConnectionFieldSpec(normalized, mode),
		]);
		const activeSpec =
			findConnectionFieldSpec(connectionFieldSpecs, normalized, mode) ??
			connectionFieldSpecs[0];
		const connectionFields = getConnectionSpecFields(connectionFieldSpecs);
		this.state = {
			...this.state,
			connectionFields,
			connectionFieldSpecs,
			connectionFieldModes: normalizeConnectionFieldModes(
				this.state.connectionFieldModes,
				connectionFields,
			),
			activeConnectionFieldSpecId: activeSpec?.id ?? '',
		};
		this.setActiveConnectionField(normalized);
	}

	removeConnectionField(id: string): void {
		const spec = this.state.connectionFieldSpecs.find((item) => item.id === id);
		if (spec) {
			this.removeConnectionFieldSpec(spec.id);
			return;
		}
		this.removeConnectionFieldByName(id);
	}

	reorderConnectionField(
		id: string,
		targetId: string,
		placement: ReorderPlacement,
	): void {
		const connectionFieldSpecs = moveRelative(
			this.state.connectionFieldSpecs,
			(spec) => spec.id === id,
			(spec) => spec.id === targetId,
			placement,
		);
		if (connectionFieldSpecs === this.state.connectionFieldSpecs) {
			return;
		}
		this.state = {
			...this.state,
			connectionFieldSpecs,
			connectionFields: getConnectionSpecFields(connectionFieldSpecs),
		};
		this.emit();
	}

	private removeConnectionFieldSpec(id: string): void {
		const connectionFieldSpecs = normalizeConnectionFieldSpecs(
			this.state.connectionFieldSpecs.filter((item) => item.id !== id),
		);
		const activeSpec =
			this.state.activeConnectionFieldSpecId === id
				? connectionFieldSpecs[0]
				: this.getActiveConnectionSpec(connectionFieldSpecs);
		const connectionFields = getConnectionSpecFields(connectionFieldSpecs);
		this.state = {
			...this.state,
			connectionFields,
			connectionFieldSpecs,
			connectionFieldModes: normalizeConnectionFieldModes(
				this.state.connectionFieldModes,
				connectionFields,
			),
			activeConnectionFieldSpecId: activeSpec?.id ?? '',
			activeConnectionField: activeSpec?.field ?? '',
		};
		this.emit();
	}

	private removeConnectionFieldByName(field: string): void {
		const normalized = field.trim();
		if (!normalized) {
			return;
		}
		const connectionFieldSpecs = normalizeConnectionFieldSpecs(
			this.state.connectionFieldSpecs.filter(
				(item) => item.field !== normalized,
			),
		);
		const activeSpec =
			this.state.activeConnectionField === normalized
				? connectionFieldSpecs[0]
				: this.getActiveConnectionSpec(connectionFieldSpecs);
		const connectionFields = getConnectionSpecFields(connectionFieldSpecs);
		this.state = {
			...this.state,
			connectionFields,
			connectionFieldSpecs,
			connectionFieldModes: normalizeConnectionFieldModes(
				this.state.connectionFieldModes,
				connectionFields,
			),
			activeConnectionFieldSpecId: activeSpec?.id ?? '',
			activeConnectionField: activeSpec?.field ?? '',
		};
		this.emit();
	}

	setConnectionFieldMode(field: string, mode: ConnectionFieldMode): void {
		const normalized = field.trim();
		if (!normalized) {
			return;
		}
		const connectionFieldSpecs = normalizeConnectionFieldSpecs([
			...this.state.connectionFieldSpecs,
			createConnectionFieldSpec(normalized, mode),
		]);
		const activeSpec =
			findConnectionFieldSpec(connectionFieldSpecs, normalized, mode) ??
			connectionFieldSpecs[0];
		const connectionFields = getConnectionSpecFields(connectionFieldSpecs);
		this.state = {
			...this.state,
			connectionFields,
			connectionFieldSpecs,
			connectionFieldModes: normalizeConnectionFieldModes(
				{
					...this.state.connectionFieldModes,
					[normalized]:
						mode === 'bidirectional'
							? 'bidirectional'
							: DEFAULT_CONNECTION_FIELD_MODE,
				},
				connectionFields,
			),
			activeConnectionFieldSpecId: activeSpec?.id ?? '',
			activeConnectionField: activeSpec?.field ?? normalized,
		};
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
		const undo = await this.addFrontmatterConnection(
			sourceFile,
			targetFile,
			normalizedField,
			link,
		);
		if (this.getConnectionModeForField(normalizedField) === 'bidirectional') {
			const reverseLink = this.app.fileManager.generateMarkdownLink(
				sourceFile,
				targetFile.path,
			);
			const reverseUndo = await this.addFrontmatterConnection(
				targetFile,
				sourceFile,
				normalizedField,
				reverseLink,
			);
			undo.push(...reverseUndo);
		}
		if (undo.length > 0) {
			this.connectionUndoStack.push(undo);
			this.updateConnectionUndoCount();
			this.scheduleRefresh(
				this.state.mode === 'flow' && this.relayoutFlowAfterConnection,
			);
		}
	}

	async undoLastConnection(): Promise<void> {
		while (this.connectionUndoStack.length > 0) {
			const undo = this.connectionUndoStack.pop();
			if (!undo) {
				break;
			}
			const changed = await this.undoFrontmatterChanges(undo);
			this.updateConnectionUndoCount();
			if (changed) {
				this.scheduleRefresh();
				return;
			}
		}
		this.updateConnectionUndoCount();
	}

	private async undoFrontmatterChanges(
		changes: ConnectionUndoEntry,
	): Promise<boolean> {
		let changed = false;
		for (const undo of [...changes].reverse()) {
			const sourceFile = this.app.vault.getAbstractFileByPath(undo.sourcePath);
			if (!(sourceFile instanceof TFile)) {
				continue;
			}

			await this.app.fileManager.processFrontMatter(sourceFile, (frontmatter) => {
				const data = asFrontmatterRecord(frontmatter);
				const currentValue = data[undo.field];
				const currentValues = toFrontmatterArray(currentValue);
				const remainingValues = currentValues.filter(
					(value) => !frontmatterValueEquals(value, undo.link),
				);
				if (remainingValues.length === currentValues.length) {
					return;
				}

				const previousValues = toFrontmatterArray(undo.previousValue);
				if (undo.hadField && valuesEqual(remainingValues, previousValues)) {
					data[undo.field] = undo.previousValue;
				} else if (!undo.hadField && remainingValues.length === 0) {
					delete data[undo.field];
				} else {
					data[undo.field] = remainingValues;
				}
				changed = true;
			});
		}
		return changed;
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
		const projection =
			this.state.chartSource === 'curated'
				? this.curatedEngine.project(this.index, this.state.curated)
				: this.queryEngine.project(
						this.index,
						this.state.query,
						this.state.globalQuery,
					);
		const selectedNodeId =
			this.state.selectedNodeId &&
			projection.nodes.some((node) => node.id === this.state.selectedNodeId)
				? this.state.selectedNodeId
				: undefined;
		this.state = this.withCubeLayout(
			{ ...this.state, projection, selectedNodeId },
			projection,
		);
		this.emit();
	}

	private withCubeLayout(
		state: WorkspaceState,
		projection: GraphProjection,
	): WorkspaceState {
		const activeChart = state.charts.find(
			(chart) => chart.id === state.activeChartId,
		);
		if (!activeChart || activeChart.type !== 'cube') {
			return state;
		}
		const layout = normalizeCubeLayout(
			activeChart.layout,
			projection.nodes.map((node) => node.id),
		);
		if (layout === activeChart.layout) {
			return state;
		}
		const nextChart = { ...activeChart, layout };
		return {
			...state,
			charts: state.charts.map((chart) =>
				chart.id === nextChart.id ? nextChart : chart,
			),
			manualLayout: cloneSerializable(layout.manual ?? { nodes: {}, groups: [] }),
			layoutRevision: state.layoutRevision + 1,
		};
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

	private getActiveConnectionSpec(
		specs = this.state.connectionFieldSpecs,
	): ConnectionFieldSpec | undefined {
		return (
			specs.find(
				(item) => item.id === this.state.activeConnectionFieldSpecId,
			) ??
			specs.find((item) => item.field === this.state.activeConnectionField) ??
			specs[0]
		);
	}

	private getActiveConnectionMode(): ConnectionFieldMode {
		return this.getActiveConnectionSpec()?.mode ?? DEFAULT_CONNECTION_FIELD_MODE;
	}

	private setGraphForceSetting(
		key:
			| 'centerForce'
			| 'repelForce'
			| 'linkForce'
			| 'dragLinkForce'
			| 'returnForce'
			| 'linkDistance',
		value: number,
	): void {
		const normalized = normalizeForceSetting(value);
		if (this.getActiveChart().layout[key] === normalized) {
			return;
		}
		this.state = this.updateActiveChart(
			{
				layout: {
					...this.getActiveChart().layout,
					[key]: normalized,
				},
			},
		);
		this.emit();
	}

	private getConnectionModeForField(field: string): ConnectionFieldMode {
		const activeSpec = this.getActiveConnectionSpec();
		if (activeSpec?.field === field) {
			return activeSpec.mode;
		}
		return DEFAULT_CONNECTION_FIELD_MODE;
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
			chartSource: nextChart.source,
			flowEdgeStyle: nextChart.layout.edgeStyle ?? 'orthogonal',
			flowDirection: nextChart.layout.direction ?? 'LR',
			arcDirection: nextChart.layout.arcDirection ?? 'right',
			fadeDistance: nextChart.display.fadeDistance,
			labelSize: nextChart.display.labelSize,
				labelPosition: nextChart.display.labelPosition,
					labelColor: nextChart.display.labelColor,
					labelBackgroundOpacity: nextChart.display.labelBackgroundOpacity,
					labelDensity: nextChart.display.labelDensity,
					cubeFaceOpacity: nextChart.display.cubeFaceOpacity,
					forceLabels: nextChart.display.forceLabels,
				enableForceLayout: nextChart.display.enableForceLayout,
			graphSpacing:
				isForceGraphType(nextChart.type)
					? nextChart.layout.spacing
					: this.state.graphSpacing,
			graphCenterForce:
				isForceGraphType(nextChart.type) && nextChart.layout.centerForce !== undefined
					? nextChart.layout.centerForce
					: this.state.graphCenterForce,
			graphRepelForce:
				isForceGraphType(nextChart.type) && nextChart.layout.repelForce !== undefined
					? nextChart.layout.repelForce
					: this.state.graphRepelForce,
			graphLinkForce:
				isForceGraphType(nextChart.type) && nextChart.layout.linkForce !== undefined
					? nextChart.layout.linkForce
					: this.state.graphLinkForce,
			graphDragLinkForce:
				isForceGraphType(nextChart.type) &&
				nextChart.layout.dragLinkForce !== undefined
					? nextChart.layout.dragLinkForce
					: this.state.graphDragLinkForce,
			graphReturnForce:
				isForceGraphType(nextChart.type) &&
				nextChart.layout.returnForce !== undefined
					? nextChart.layout.returnForce
					: this.state.graphReturnForce,
			graphLinkDistance:
				isForceGraphType(nextChart.type) && nextChart.layout.linkDistance !== undefined
					? nextChart.layout.linkDistance
					: this.state.graphLinkDistance,
			flowSpacing:
				nextChart.type === 'flow'
					? nextChart.layout.spacing
					: this.state.flowSpacing,
				arcSpacing:
					nextChart.type === 'arc'
						? nextChart.layout.spacing
						: this.state.arcSpacing,
				manualLayout: cloneSerializable(
					nextChart.layout.manual ?? { nodes: {}, groups: [] },
				),
				query: cloneSerializable(nextChart.query),
				curated: cloneSerializable(nextChart.curated),
				nodeStyleOverrides: cloneSerializable(nextChart.style.nodeOverrides),
				linkStyleOverrides: cloneSerializable(nextChart.style.linkOverrides),
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

	private async addFrontmatterConnection(
		sourceFile: TFile,
		targetFile: TFile,
		field: string,
		link: string,
	): Promise<ConnectionUndoChange[]> {
		let undo: ConnectionUndoChange | undefined;
		await this.app.fileManager.processFrontMatter(sourceFile, (frontmatter) => {
			const data = asFrontmatterRecord(frontmatter);
			const hadField = Object.prototype.hasOwnProperty.call(data, field);
			const currentValue = data[field];
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
				field,
				link,
				hadField,
				previousValue: cloneFrontmatterValue(currentValue),
			};
			data[field] = [...currentValues, link];
		});
		return undo ? [undo] : [];
	}

	private async renderTemplateContent(
		template: DockTemplateNode,
		title: string,
	): Promise<string> {
		const templateFile = this.app.vault.getAbstractFileByPath(
			normalizePath(template.templatePath),
		);
		const raw =
			templateFile instanceof TFile
				? await this.app.vault.cachedRead(templateFile)
				: '# {{title}}\n';
		const rendered = raw
			.replaceAll('{{title}}', title)
			.replaceAll('{{name}}', title)
			.replaceAll('{{date}}', window.moment().format('YYYY-MM-DD'))
			.replaceAll('{{time}}', window.moment().format('HH:mm'))
			.replace(/\{\{date:(.+?)\}\}/gu, (_, fmt: string) =>
				window.moment().format(fmt),
			);
		return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
	}

	private async ensureFolderPath(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		if (!normalized) {
			return;
		}
		let current = '';
		for (const part of normalized.split('/').filter(Boolean)) {
			current = current ? `${current}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (existing instanceof TFolder) {
				continue;
			}
			if (existing) {
				throw new Error(`Cannot create folder "${current}". A file exists there.`);
			}
			await this.app.vault.createFolder(current);
		}
	}

	private createAvailableMarkdownPath(folderPath: string, title: string): string {
		const baseName = sanitizeFileName(title);
		const folder = normalizePath(folderPath);
		let index = 1;
		while (true) {
			const suffix = index === 1 ? '' : ` ${index}`;
			const path = normalizePath(
				folder
					? `${folder}/${baseName}${suffix}.md`
					: `${baseName}${suffix}.md`,
			);
			if (!this.app.vault.getAbstractFileByPath(path)) {
				return path;
			}
			index += 1;
		}
	}
}

function normalizeSpacing(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeForceSetting(value: number): number {
	return Number.isFinite(value) && value >= 0 ? value : 1;
}

function isForceGraphType(type: ViewMode): boolean {
	return type === 'graph' || type === 'graph-3d' || type === 'cube';
}

const CUBE_FACE_GROUPS: ChartGroup[] = [
	{
		id: 'cube-front',
		name: 'Front',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#009b48',
		mode: 'manual',
		padding: 0.22,
	},
	{
		id: 'cube-back',
		name: 'Back',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#0046ad',
		mode: 'manual',
		padding: 0.22,
	},
	{
		id: 'cube-left',
		name: 'Left',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#ff5800',
		mode: 'manual',
		padding: 0.22,
	},
	{
		id: 'cube-right',
		name: 'Right',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#b71234',
		mode: 'manual',
		padding: 0.22,
	},
	{
		id: 'cube-top',
		name: 'Top',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#ffffff',
		mode: 'manual',
		padding: 0.22,
	},
	{
		id: 'cube-bottom',
		name: 'Bottom',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#ffd500',
		mode: 'manual',
		padding: 0.22,
	},
];

const CUBE_FACE_IDS = new Set(CUBE_FACE_GROUPS.map((group) => group.id));

function createDefaultGroup(index: number): ChartGroup {
		return {
			id: createGroupId(`Group ${index}`),
			name: `Group ${index}`,
			x: -1.6,
			y: -1.1,
			width: 3.2,
			height: 2.2,
			color: '#7c6ff0',
			mode: 'manual',
			padding: 0.32,
		};
	}

function normalizeCubeLayout(
	layout: ChartLayoutConfig,
	visibleNodeIds: string[],
): ChartLayoutConfig {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	const existingGroups = new Map(manual.groups.map((group) => [group.id, group]));
	const groups = CUBE_FACE_GROUPS.map((defaultGroup) => ({
		...defaultGroup,
		...(existingGroups.get(defaultGroup.id) ?? {}),
		id: defaultGroup.id,
		color: defaultGroup.color,
	}));
	const nodes = { ...manual.nodes };
	let changed =
		manual.groups.length !== groups.length ||
		groups.some(
			(group, index) =>
				manual.groups[index]?.id !== group.id ||
				manual.groups[index]?.color !== group.color,
		);

	for (const [nodeId, placement] of Object.entries(nodes)) {
		if (placement.groupId && CUBE_FACE_IDS.has(placement.groupId)) {
			continue;
		}
		nodes[nodeId] = {
			x: placement.x,
			y: placement.y,
			groupId: getCubeFaceIdForNode(nodeId),
		};
		changed = true;
	}

	for (const nodeId of visibleNodeIds) {
		const placement = nodes[nodeId];
		if (placement?.groupId && CUBE_FACE_IDS.has(placement.groupId)) {
			continue;
		}
		const position = placement ?? createCubeNodePosition(nodeId);
		nodes[nodeId] = {
			x: position.x,
			y: position.y,
			groupId: getCubeFaceIdForNode(nodeId),
		};
		changed = true;
	}

	return changed
		? {
				...layout,
				manual: {
					...manual,
					groups,
					nodes,
				},
			}
		: layout;
}

function getCubeFaceIdForNode(nodeId: string): string {
	const index = Math.floor(hashString(nodeId) * CUBE_FACE_GROUPS.length);
	return CUBE_FACE_GROUPS[index]?.id ?? CUBE_FACE_GROUPS[0]!.id;
}

function createCubeNodePosition(nodeId: string): { x: number; y: number } {
	const first = hashString(`${nodeId}:x`);
	const second = hashString(`${nodeId}:y`);
	return {
		x: first * 1.44 - 0.72,
		y: second * 1.44 - 0.72,
	};
}

interface PlacementBounds {
	left: number;
	right: number;
	bottom: number;
	top: number;
}

const MANUAL_NODE_SPACING = 0.62;

function addManualPlacements(
	layout: ChartLayoutConfig,
	previousPaths: string[],
	nextPaths: string[],
	groupId?: string,
): ChartLayoutConfig {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	const previous = new Set(previousPaths);
	const addedPaths = nextPaths.filter((path) => !previous.has(path));
	if (addedPaths.length === 0) {
		return layout;
	}
	const group = groupId
		? manual.groups.find((item) => item.id === groupId)
		: undefined;
	if (groupId && !group) {
		return layout;
	}
	const bounds = group
		? readGroupPlacementBounds(group)
		: readUngroupedPlacementBounds(Object.values(manual.nodes));
	const occupied = Object.entries(manual.nodes)
		.filter(([, placement]) =>
			group ? placement.groupId === group.id : placement.groupId === undefined,
		)
		.map(([, placement]) => ({ x: placement.x, y: placement.y }));
	const nodes = { ...manual.nodes };
	const newPositions: Array<{ x: number; y: number }> = [];
	for (const path of addedPaths) {
		const position = findOpenManualPlacement(bounds, occupied);
		occupied.push(position);
		newPositions.push(position);
		nodes[path] = groupId ? { ...position, groupId } : position;
	}
	const groups =
		group && newPositions.length > 0
			? manual.groups.map((item) =>
					item.id === group.id
						? expandGroupToPositions(item, newPositions)
						: item,
				)
			: manual.groups;
	return {
		...layout,
		manual: {
			...manual,
			nodes,
			groups,
		},
	};
}

function moveManualNodesToGroup(
	layout: ChartLayoutConfig,
	paths: string[],
	groupId?: string,
): ChartLayoutConfig {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	const movingPaths = new Set(paths);
	const group = groupId
		? manual.groups.find((item) => item.id === groupId)
		: undefined;
	if (groupId && !group) {
		return layout;
	}
	const bounds = group
		? readGroupPlacementBounds(group)
		: readUngroupedPlacementBounds(
				Object.entries(manual.nodes)
					.filter(([nodeId]) => !movingPaths.has(nodeId))
					.map(([, placement]) => placement),
			);
	const occupied = Object.entries(manual.nodes)
		.filter(([nodeId, placement]) => {
			if (movingPaths.has(nodeId)) {
				return false;
			}
			return group
				? placement.groupId === group.id
				: placement.groupId === undefined;
		})
		.map(([, placement]) => ({ x: placement.x, y: placement.y }));
	const nodes = { ...manual.nodes };
	const newPositions: Array<{ x: number; y: number }> = [];
	let changed = false;
	for (const path of paths) {
		const previous = manual.nodes[path];
		const position =
			previous && (!group || isPositionInsideGroup(previous, group))
				? { x: previous.x, y: previous.y }
				: findOpenManualPlacement(bounds, occupied);
		occupied.push(position);
		newPositions.push(position);
		const nextPlacement = groupId ? { ...position, groupId } : position;
		const nextGroupId = groupId ?? undefined;
		if (
			previous?.x !== nextPlacement.x ||
			previous?.y !== nextPlacement.y ||
			previous?.groupId !== nextGroupId
		) {
			changed = true;
		}
		nodes[path] = nextPlacement;
	}
	if (!changed) {
		return layout;
	}
	const groups =
		group && newPositions.length > 0
			? manual.groups.map((item) =>
					item.id === group.id
						? expandGroupToPositions(item, newPositions)
						: item,
				)
			: manual.groups;
	return {
		...layout,
		manual: {
			...manual,
			nodes,
			groups,
		},
	};
}

function readGroupPlacementBounds(group: ChartGroup): PlacementBounds {
	const padding = Math.min(group.padding, group.width / 3, group.height / 3);
	return {
		left: group.x + padding,
		right: group.x + group.width - padding,
		bottom: group.y + padding,
		top: group.y + group.height - padding,
	};
}

function isPositionInsideGroup(
	position: { x: number; y: number },
	group: ChartGroup,
): boolean {
	return (
		position.x >= group.x &&
		position.x <= group.x + group.width &&
		position.y >= group.y &&
		position.y <= group.y + group.height
	);
}

function readUngroupedPlacementBounds(
	placements: Array<{ x: number; y: number }>,
): PlacementBounds {
	if (placements.length === 0) {
		return { left: -1.6, right: 1.6, bottom: -1.1, top: 1.1 };
	}
	const center = placements.reduce(
		(total, placement) => ({
			x: total.x + placement.x / placements.length,
			y: total.y + placement.y / placements.length,
		}),
		{ x: 0, y: 0 },
	);
	return {
		left: center.x - 1.6,
		right: center.x + 1.6,
		bottom: center.y - 1.1,
		top: center.y + 1.1,
	};
}

function findOpenManualPlacement(
	bounds: PlacementBounds,
	occupied: Array<{ x: number; y: number }>,
): { x: number; y: number } {
	const center = {
		x: (bounds.left + bounds.right) / 2,
		y: (bounds.bottom + bounds.top) / 2,
	};
	for (let expansion = 0; expansion < 6; expansion += 1) {
		const expanded = expandBounds(bounds, expansion * MANUAL_NODE_SPACING);
		const candidates = createPlacementCandidates(expanded, center);
		const candidate = candidates.find((position) =>
			isManualPlacementOpen(position, occupied),
		);
		if (candidate) {
			return candidate;
		}
	}
	return {
		x: center.x + occupied.length * MANUAL_NODE_SPACING,
		y: center.y,
	};
}

function createPlacementCandidates(
	bounds: PlacementBounds,
	center: { x: number; y: number },
): Array<{ x: number; y: number }> {
	const candidates: Array<{ x: number; y: number }> = [];
	const columns = Math.max(
		1,
		Math.floor((bounds.right - bounds.left) / MANUAL_NODE_SPACING) + 1,
	);
	const rows = Math.max(
		1,
		Math.floor((bounds.top - bounds.bottom) / MANUAL_NODE_SPACING) + 1,
	);
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			candidates.push({
				x: bounds.left + column * MANUAL_NODE_SPACING,
				y: bounds.bottom + row * MANUAL_NODE_SPACING,
			});
		}
	}
	candidates.push(center);
	return candidates.sort((left, right) => {
		const leftDistance = distanceSquared(left, center);
		const rightDistance = distanceSquared(right, center);
		return leftDistance - rightDistance;
	});
}

function isManualPlacementOpen(
	position: { x: number; y: number },
	occupied: Array<{ x: number; y: number }>,
): boolean {
	return occupied.every(
		(placement) =>
			distanceSquared(position, placement) >=
			MANUAL_NODE_SPACING * MANUAL_NODE_SPACING,
	);
}

function expandBounds(bounds: PlacementBounds, amount: number): PlacementBounds {
	return {
		left: bounds.left - amount,
		right: bounds.right + amount,
		bottom: bounds.bottom - amount,
		top: bounds.top + amount,
	};
}

function expandGroupToPositions(
	group: ChartGroup,
	positions: Array<{ x: number; y: number }>,
): ChartGroup {
	const padding = group.padding;
	const left = Math.min(group.x, ...positions.map((position) => position.x - padding));
	const right = Math.max(
		group.x + group.width,
		...positions.map((position) => position.x + padding),
	);
	const bottom = Math.min(
		group.y,
		...positions.map((position) => position.y - padding),
	);
	const top = Math.max(
		group.y + group.height,
		...positions.map((position) => position.y + padding),
	);
	return {
		...group,
		x: left,
		y: bottom,
		width: right - left,
		height: top - bottom,
	};
}

function distanceSquared(
	left: { x: number; y: number },
	right: { x: number; y: number },
): number {
	const dx = left.x - right.x;
	const dy = left.y - right.y;
	return dx * dx + dy * dy;
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0xffffffff;
}

function createUniqueDefaultGroup(existingGroups: ChartGroup[]): ChartGroup {
	const existingIds = new Set(existingGroups.map((group) => group.id));
	let index = existingGroups.length + 1;
	let group = createDefaultGroup(index);
	while (existingIds.has(group.id)) {
		index += 1;
		group = createDefaultGroup(index);
	}
	return group;
}

function createGroupId(name: string): string {
	const slug = name
		.trim()
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return `group-${slug || Date.now().toString(36)}`;
}

function normalizeGroupPatch(
	group: ChartGroup,
	patch: Partial<ChartGroup>,
): ChartGroup {
	return {
		...group,
		...patch,
		name:
			typeof patch.name === 'string' && patch.name.trim()
				? patch.name.trim()
				: group.name,
		width:
			typeof patch.width === 'number' && Number.isFinite(patch.width)
				? Math.max(0.8, patch.width)
				: group.width,
		height:
			typeof patch.height === 'number' && Number.isFinite(patch.height)
				? Math.max(0.6, patch.height)
				: group.height,
		padding:
			typeof patch.padding === 'number' && Number.isFinite(patch.padding)
				? Math.max(0, patch.padding)
				: group.padding,
		mode: patch.mode === 'rule' ? 'rule' : (patch.mode ?? group.mode),
	};
}

function createDockId(prefix: string, value: string): string {
	const slug = value
		.trim()
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return `${prefix}-${slug || Date.now().toString(36)}`;
}

function sanitizeFileName(value: string): string {
	const sanitized = value
		.trim()
		.replace(/[\\/:*?"<>|#^[\]]/gu, '-')
		.replace(/\s+/gu, ' ')
		.replace(/^-+|-+$/gu, '');
	return sanitized || 'Untitled';
}

function asFrontmatterRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
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

function getConnectionSpecFields(specs: ConnectionFieldSpec[]): string[] {
	return normalizeConnectionFields(specs.map((spec) => spec.field));
}

function findConnectionFieldSpec(
	specs: ConnectionFieldSpec[],
	field: string,
	mode: ConnectionFieldMode,
): ConnectionFieldSpec | undefined {
	return specs.find((spec) => spec.field === field && spec.mode === mode);
}

type ReorderPlacement = 'before' | 'after';

function moveRelative<T>(
	items: T[],
	matchMoved: (item: T) => boolean,
	matchTarget: (item: T) => boolean,
	placement: ReorderPlacement,
): T[] {
	const fromIndex = items.findIndex(matchMoved);
	const toIndex = items.findIndex(matchTarget);
	if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
		return items;
	}
	const next = [...items];
	const [moved] = next.splice(fromIndex, 1) as [T];
	const targetIndex = next.findIndex(matchTarget);
	if (targetIndex < 0) {
		return items;
	}
	next.splice(placement === 'after' ? targetIndex + 1 : targetIndex, 0, moved);
	if (next.every((item, index) => item === items[index])) {
		return items;
	}
	return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function readVaultFolders(app: App): string[] {
	return uniqueSorted(
		app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
			.map((folder) => folder.path)
			.filter((path) => path !== '/'),
	);
}

function mapSetsToRecord(
	map: Map<string, Set<string>> | undefined,
): Record<string, string[]> {
	return Object.fromEntries(
		[...(map?.entries() ?? [])].map(([key, values]) => [key, [...values]]),
	);
}
