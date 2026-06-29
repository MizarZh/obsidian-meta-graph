import { TFile, type App } from 'obsidian';
import { normalizePath } from '../core/knowledge-index';
import { extractLinkText } from '../core/link-resolver';
import type {
	ArcDirection,
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
	MetaGraphDock,
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
import {
	addCuratedFilePaths,
	removeCuratedFilePaths,
	renameCuratedFilePath,
} from './curated-workspace';
import { createWorkspaceState } from './workspace-state';
import {
	createDefaultCuratedWorkspace,
	createDefaultChart,
	DEFAULT_CONNECTION_FIELD_MODE,
	normalizeCuratedWorkspace,
	normalizeGlobalLinkStyleRules,
	normalizeGlobalNodeStyleRules,
	normalizeLinkStyleRules,
	normalizeNodeStyleRules,
	serializeMetaGraphState,
} from './meta-graph-model';
import {
	addConnectionFieldToState,
	findConnectionFieldSpec,
	removeConnectionFieldFromState,
	reorderConnectionFieldInState,
	setConnectionFieldModeInState,
} from './workspace-connection-fields';
import {
	addDockNote as addDockNoteToState,
	addDockTemplate as addDockTemplateToState,
	moveRelative,
	removeDockNote as removeDockNoteFromState,
	removeDockTemplate as removeDockTemplateFromState,
	reorderDockNote as reorderDockNoteInState,
	reorderDockTemplate as reorderDockTemplateInState,
	setCuratedPanelWidth as setCuratedPanelWidthInState,
	setDockFocusOnSelect as setDockFocusOnSelectInState,
	setDockWidth as setDockWidthInState,
	updateDockNotePath as updateDockNotePathInState,
	updateDockTemplate as updateDockTemplateInState,
	type ReorderPlacement,
} from './workspace-dock-state';
import {
	addManualPlacements,
	createUniqueDefaultGroup,
	findManualPlacement,
	getManualGroup,
	moveManualNodesToGroup,
	normalizeCubeLayout,
	normalizeGroupPatch,
	readGroupPlacementBounds,
	removeManualPlacements,
} from './workspace-manual-layout';
import {
	WorkspaceProjectionService,
	buildWorkspaceIndex,
} from './workspace-query-service';
import { updateActiveChartState } from './workspace-state-updaters';
import { createTemplateNoteFile } from './workspace-template-service';
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
	private readonly projectionService = new WorkspaceProjectionService();
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
		const indexSnapshot = buildWorkspaceIndex(
			this.app,
			this.debug,
			this.state.connectionFields,
		);
		this.index = indexSnapshot.index;
		this.unresolvedLinks = indexSnapshot.unresolvedLinks;
		this.metadataSources = indexSnapshot.metadataSources;
		const charts = pruneMissingCuratedFiles(
			this.state.charts,
			new Set(this.index.nodes.keys()),
		);
		const activeChart = charts.find(
			(chart) => chart.id === this.state.activeChartId,
		);
		this.state = {
			...this.state,
			charts,
			curated: activeChart?.curated ?? this.state.curated,
				layoutRevision:
					this.state.layoutRevision + (forceLayout ? 1 : 0),
				availableFolders: indexSnapshot.availableFolders,
				availableTags: indexSnapshot.availableTags,
				availableDomains: indexSnapshot.availableDomains,
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

	setNodeGroup(nodeId: NodeId, groupId?: string): void {
		const activeChart = this.getActiveChart();
		if (activeChart.type !== 'free' && activeChart.type !== 'cube') {
			return;
		}
		if (activeChart.type === 'cube' && !groupId) {
			return;
		}
		const layout = moveManualNodesToGroup(
			activeChart.layout,
			[nodeId],
			groupId || undefined,
		);
		if (layout === activeChart.layout) {
			return;
		}
		this.state = this.updateActiveChart({ layout });
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
		const activeChart = this.getActiveChart();
		const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
		const group = getManualGroup(activeChart.layout, activeChart.type, groupId);
		if (!group) {
			return;
		}
		const occupied = Object.entries(manual.nodes)
			.filter(([nodeId, placement]) =>
				nodeId !== path && placement.groupId === group.id,
			)
			.map(([, placement]) => ({ x: placement.x, y: placement.y }));
		this.setManualNodePosition(
			path,
			findManualPlacement(readGroupPlacementBounds(group), occupied, group.id),
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
		this.state = this.updateActiveChart(
			{
				curated: update.curated,
				layout: removeManualPlacements(activeChart.layout, paths),
			},
			true,
		);
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
				layout: removeManualPlacements(
					activeChart.layout,
					activeChart.curated.files.map((file) => file.path),
				),
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
		this.setDockState(addDockTemplateToState(this.state.dock, template));
	}

	updateDockTemplate(
		templateId: string,
		patch: Omit<DockTemplateNode, 'id'>,
	): void {
		this.setDockState(
			updateDockTemplateInState(this.state.dock, templateId, patch),
		);
	}

	removeDockTemplate(templateId: string): void {
		this.setDockState(removeDockTemplateFromState(this.state.dock, templateId));
	}

	reorderDockTemplate(
		templateId: string,
		targetTemplateId: string,
		placement: ReorderPlacement,
	): void {
		this.setDockState(
			reorderDockTemplateInState(
				this.state.dock,
				templateId,
				targetTemplateId,
				placement,
			),
		);
	}

	addDockNote(path: NodeId): void {
		this.setDockState(addDockNoteToState(this.state.dock, path));
	}

	setDockWidth(dockWidth: number): void {
		this.setDockState(setDockWidthInState(this.state.dock, dockWidth));
	}

	setCuratedPanelWidth(curatedPanelWidth: number): void {
		this.setDockState(
			setCuratedPanelWidthInState(this.state.dock, curatedPanelWidth),
		);
	}

	setDockFocusOnSelect(focusOnSelect: boolean): void {
		this.setDockState(
			setDockFocusOnSelectInState(this.state.dock, focusOnSelect),
		);
	}

	updateDockNotePath(oldPath: string, newPath: string): boolean {
		const normalizedOld = normalizePath(oldPath);
		const normalizedNew = normalizePath(newPath);
		if (normalizedOld === normalizedNew) {
			return false;
		}
		const dock = updateDockNotePathInState(
			this.state.dock,
			normalizedOld,
			normalizedNew,
		);
		if (dock === this.state.dock) {
			return false;
		}
		this.setDockState(dock);
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
		this.setDockState(removeDockNoteFromState(this.state.dock, path));
	}

	reorderDockNote(
		path: NodeId,
		targetPath: NodeId,
		placement: ReorderPlacement,
	): void {
		this.setDockState(
			reorderDockNoteInState(this.state.dock, path, targetPath, placement),
		);
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
		const file = await createTemplateNoteFile(this.app, template, title);

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
		const update = addConnectionFieldToState(
			this.state,
			field,
			this.getActiveConnectionMode(),
		);
		if (!update.normalized) {
			return;
		}
		this.state = update.state;
		this.setActiveConnectionField(update.normalized);
	}

	removeConnectionField(id: string): void {
		const state = removeConnectionFieldFromState(this.state, id);
		if (state === this.state) {
			return;
		}
		this.state = state;
		this.emit();
	}

	reorderConnectionField(
		id: string,
		targetId: string,
		placement: ReorderPlacement,
	): void {
		const state = reorderConnectionFieldInState(
			this.state,
			id,
			targetId,
			placement,
		);
		if (state === this.state) {
			return;
		}
		this.state = state;
		this.emit();
	}

	setConnectionFieldMode(field: string, mode: ConnectionFieldMode): void {
		const state = setConnectionFieldModeInState(this.state, field, mode);
		if (state === this.state) {
			return;
		}
		this.state = state;
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
		const mode = this.getConnectionModeForField(normalizedField);
		if (mode === 'reverse') {
			const reverseLink = this.app.fileManager.generateMarkdownLink(
				sourceFile,
				targetFile.path,
			);
			const undo = await this.addFrontmatterConnection(
				targetFile,
				sourceFile,
				normalizedField,
				reverseLink,
			);
			if (undo.length > 0) {
				this.connectionUndoStack.push(undo);
				this.updateConnectionUndoCount();
				this.scheduleRefresh(
					this.state.mode === 'flow' && this.relayoutFlowAfterConnection,
				);
			}
			return;
		}
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
		if (mode === 'bidirectional') {
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
		const projection = this.projectionService.project(this.index, this.state);
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

	private setDockState(dock: MetaGraphDock): void {
		if (dock === this.state.dock) {
			return;
		}
		this.state = {
			...this.state,
			dock,
		};
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
		return updateActiveChartState(this.state, patch, forceLayout);
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

}

function normalizeSpacing(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeForceSetting(value: number): number {
	return Number.isFinite(value) && value >= 0 ? value : 1;
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

function pruneMissingCuratedFiles(
	charts: MetaGraphChart[],
	existingPaths: Set<string>,
): MetaGraphChart[] {
	let changed = false;
	const nextCharts = charts.map((chart) => {
		const missingPaths = chart.curated.files
			.map((file) => file.path)
			.filter((path) => !existingPaths.has(path));
		if (missingPaths.length === 0) {
			return chart;
		}
		const update = removeCuratedFilePaths(chart.curated, missingPaths);
		if (!update.changed) {
			return chart;
		}
		const layout = removeManualPlacements(chart.layout, missingPaths);
		changed = true;
		return { ...chart, curated: update.curated, layout };
	});
	return changed ? nextCharts : charts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mapSetsToRecord(
	map: Map<string, Set<string>> | undefined,
): Record<string, string[]> {
	return Object.fromEntries(
		[...(map?.entries() ?? [])].map(([key, values]) => [key, [...values]]),
	);
}
