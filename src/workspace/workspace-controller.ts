import { TFile, type App } from 'obsidian';
import { normalizePath } from '../core/knowledge-index';
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
import { createWorkspaceState } from './workspace-state';
import {
	DEFAULT_CONNECTION_FIELD_MODE,
	serializeMetaGraphState,
} from './meta-graph-model';
import {
	setArcDirectionInState,
	setArcSpacingInState,
	setCubeFaceOpacityInState,
	setEnableForceLayoutInState,
	setFadeDistanceInState,
	setFlowDirectionInState,
	setFlowEdgeStyleInState,
	setFlowSpacingInState,
	setForceLabelsInState,
	setGraphForceSettingInState,
	setGraphSpacingInState,
	setLabelBackgroundOpacityInState,
	setLabelColorInState,
	setLabelDensityInState,
	setLabelPositionInState,
	setLabelSizeInState,
	type GraphForceSettingKey,
} from './workspace-chart-settings';
import {
	setDefaultLinkStyleInState,
	setDefaultNodeStyleInState,
	setGlobalLinkStyleRulesInState,
	setGlobalNodeStyleRulesInState,
	setLinkStyleOverridesInState,
	setLinkStyleRulesInState,
	setNodeStyleOverridesInState,
	setNodeStyleRulesInState,
} from './workspace-style-state';
import {
	addConnectionFieldToState,
	removeConnectionFieldFromState,
	reorderConnectionFieldInState,
	setActiveConnectionFieldInState,
	setConnectionFieldModeInState,
} from './workspace-connection-fields';
import { WorkspaceConnectionService } from './workspace-connection-service';
import {
	addCuratedFilesToState,
	clearCuratedFilesInState,
	pruneMissingCuratedFiles,
	removeCuratedFilesFromState,
	renameCuratedFilePathInState,
	reorderCuratedFileInState,
	updateCuratedWorkspaceInState,
} from './workspace-curated-state';
import {
	addDockNoteInState,
	addDockTemplateInState,
	removeDockNoteInState,
	removeDockTemplateInState,
	reorderDockNoteInState,
	reorderDockTemplateInState,
	setCuratedPanelWidthInState,
	setDockFocusOnSelectInState,
	setDockWidthInState,
	updateDockNotePathInState,
	updateDockTemplateInState,
	type ReorderPlacement,
} from './workspace-dock-actions';
import {
	normalizeCubeLayout,
} from './workspace-manual-layout';
import {
	addGroupInState,
	deleteGroupInState,
	moveCuratedFilesToGroupInState,
	moveGroupInState,
	placeNodeInDefaultGroupInState,
	resizeGroupInState,
	setManualNodePositionInState,
	setNodeGroupInState,
	updateGroupInState,
} from './workspace-manual-layout-state';
import {
	WorkspaceProjectionService,
	buildWorkspaceIndex,
} from './workspace-query-service';
import {
	updateGlobalQueryInState,
	updateQueryInState,
} from './workspace-query-state';
import {
	addChartInState,
	deleteActiveChartInState,
	setActiveChartInState,
	setActiveChartNameInState,
	setActiveChartSourceInState,
	setActiveChartTypeInState,
} from './workspace-chart-state';
import { updateActiveChartState } from './workspace-state-updaters';
import { createTemplateNoteFile } from './workspace-template-service';
import { resolveTemplateNoteRequest } from './workspace-template-request';
import { cloneSerializable } from './workspace-persistence';

type StateListener = (state: WorkspaceState) => void;

export class WorkspaceController {
	private state: WorkspaceState;
	private index?: KnowledgeIndex;
	private readonly projectionService = new WorkspaceProjectionService();
	private readonly connectionService: WorkspaceConnectionService<TFile>;
	private readonly listeners = new Set<StateListener>();
	private unresolvedLinks: UnresolvedLink[] = [];
	private metadataSources: MetadataDebugEntry[] = [];
	private rendererDebugState: RendererDebugState = { status: 'idle' };
	private rebuildTimer?: number;
	private pendingRefreshForceLayout = false;
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
		this.connectionService = new WorkspaceConnectionService<TFile>({
			getFile: (path) => this.app.vault.getAbstractFileByPath(path),
			isFile: (value): value is TFile => value instanceof TFile,
			getPath: (file) => file.path,
			generateMarkdownLink: (targetFile, sourcePath) =>
				this.app.fileManager.generateMarkdownLink(targetFile, sourcePath),
			processFrontMatter: (file, callback) =>
				this.app.fileManager.processFrontMatter(file, callback),
			resolveLink: (linkText, sourcePath) =>
				this.app.metadataCache.getFirstLinkpathDest(linkText, sourcePath),
		});
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
		const result = setActiveChartInState(this.state, activeChartId);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	addChart(): void {
		const result = addChartInState(this.state);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	setActiveChartName(name: string): void {
		const result = setActiveChartNameInState(this.state, name);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	setActiveChartType(type: ViewMode): void {
		const result = setActiveChartTypeInState(this.state, type);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	setActiveChartSource(source: ChartSource): void {
		const result = setActiveChartSourceInState(this.state, source);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	deleteActiveChart(): void {
		const result = deleteActiveChartInState(this.state);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	setFlowEdgeStyle(flowEdgeStyle: FlowEdgeStyle): void {
		this.setWorkspaceState(setFlowEdgeStyleInState(this.state, flowEdgeStyle));
	}

	setFlowDirection(flowDirection: FlowDirection): void {
		this.setWorkspaceState(setFlowDirectionInState(this.state, flowDirection));
	}

	setArcDirection(arcDirection: ArcDirection): void {
		this.setWorkspaceState(setArcDirectionInState(this.state, arcDirection));
	}

	setFadeDistance(fadeDistance: number): void {
		this.setWorkspaceState(setFadeDistanceInState(this.state, fadeDistance));
	}

	setLabelSize(labelSize: number): void {
		this.setWorkspaceState(setLabelSizeInState(this.state, labelSize));
	}

	setLabelPosition(labelPosition: LabelPosition): void {
		this.setWorkspaceState(setLabelPositionInState(this.state, labelPosition));
	}

	setLabelColor(labelColor: string): void {
		this.setWorkspaceState(setLabelColorInState(this.state, labelColor));
	}

	setLabelBackgroundOpacity(labelBackgroundOpacity: number): void {
		this.setWorkspaceState(
			setLabelBackgroundOpacityInState(this.state, labelBackgroundOpacity),
		);
	}

	setLabelDensity(labelDensity: number): void {
		this.setWorkspaceState(setLabelDensityInState(this.state, labelDensity));
	}

	setCubeFaceOpacity(cubeFaceOpacity: number): void {
		this.setWorkspaceState(
			setCubeFaceOpacityInState(this.state, cubeFaceOpacity),
		);
	}

	setForceLabels(forceLabels: boolean): void {
		this.setWorkspaceState(setForceLabelsInState(this.state, forceLabels));
	}

	setEnableForceLayout(enableForceLayout: boolean): void {
		this.setWorkspaceState(
			setEnableForceLayoutInState(this.state, enableForceLayout),
		);
	}

	setManualNodePosition(
		nodeId: NodeId,
		position: { x: number; y: number },
		groupId?: string,
	): void {
		this.setWorkspaceState(
			setManualNodePositionInState(this.state, nodeId, position, groupId),
		);
	}

	setNodeGroup(nodeId: NodeId, groupId?: string): void {
		this.setWorkspaceState(setNodeGroupInState(this.state, nodeId, groupId));
	}

	addGroup(): void {
		this.setWorkspaceState(addGroupInState(this.state));
	}

	updateGroup(groupId: string, patch: Partial<ChartGroup>): void {
		this.setWorkspaceState(updateGroupInState(this.state, groupId, patch));
	}

	moveGroup(groupId: string, delta: { x: number; y: number }): void {
		this.setWorkspaceState(moveGroupInState(this.state, groupId, delta));
	}

	resizeGroup(
		groupId: string,
		geometry: Pick<ChartGroup, 'x' | 'y' | 'width' | 'height'>,
	): void {
		this.setWorkspaceState(resizeGroupInState(this.state, groupId, geometry));
	}

	moveCuratedFilesToGroup(paths: NodeId[], groupId?: string): void {
		this.setWorkspaceState(
			moveCuratedFilesToGroupInState(this.state, paths, groupId),
		);
	}

	private placeTemplateNoteInDefaultGroup(
		path: NodeId,
		groupId?: string,
	): void {
		this.setWorkspaceState(
			placeNodeInDefaultGroupInState(this.state, path, groupId),
		);
	}

	deleteGroup(groupId: string): void {
		this.setWorkspaceState(deleteGroupInState(this.state, groupId));
	}

	setGraphSpacing(graphSpacing: number): void {
		this.setWorkspaceState(setGraphSpacingInState(this.state, graphSpacing));
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
		this.setWorkspaceState(setFlowSpacingInState(this.state, flowSpacing));
	}

	setArcSpacing(arcSpacing: number): void {
		this.setWorkspaceState(setArcSpacingInState(this.state, arcSpacing));
	}

	addCuratedFile(path: NodeId, groupId?: string): void {
		this.addCuratedFiles([path], groupId);
	}

	addCuratedFiles(paths: NodeId[], groupId?: string): void {
		this.setWorkspaceState(
			addCuratedFilesToState(this.state, paths, groupId),
			true,
		);
	}

	removeCuratedFile(path: NodeId): void {
		this.removeCuratedFiles([path]);
	}

	removeCuratedFiles(paths: NodeId[]): void {
		this.setWorkspaceState(removeCuratedFilesFromState(this.state, paths), true);
	}

	reorderCuratedFile(
		path: NodeId,
		targetPath: NodeId,
		placement: ReorderPlacement,
	): void {
		this.setWorkspaceState(
			reorderCuratedFileInState(this.state, path, targetPath, placement),
			true,
		);
	}

	clearCuratedFiles(): void {
		this.setWorkspaceState(clearCuratedFilesInState(this.state), true);
	}

	updateCuratedWorkspace(patch: Partial<CuratedWorkspaceConfig>): void {
		this.setWorkspaceState(updateCuratedWorkspaceInState(this.state, patch), true);
	}

	getDocument(): MetaGraphDocument {
		return serializeMetaGraphState(this.state);
	}

	addDockTemplate(
		template: Omit<DockTemplateNode, 'id'> & { id?: string },
	): void {
		this.setWorkspaceState(addDockTemplateInState(this.state, template));
	}

	updateDockTemplate(
		templateId: string,
		patch: Omit<DockTemplateNode, 'id'>,
	): void {
		this.setWorkspaceState(
			updateDockTemplateInState(this.state, templateId, patch),
		);
	}

	removeDockTemplate(templateId: string): void {
		this.setWorkspaceState(removeDockTemplateInState(this.state, templateId));
	}

	reorderDockTemplate(
		templateId: string,
		targetTemplateId: string,
		placement: ReorderPlacement,
	): void {
		this.setWorkspaceState(
			reorderDockTemplateInState(
				this.state,
				templateId,
				targetTemplateId,
				placement,
			),
		);
	}

	addDockNote(path: NodeId): void {
		this.setWorkspaceState(addDockNoteInState(this.state, path));
	}

	setDockWidth(dockWidth: number): void {
		this.setWorkspaceState(setDockWidthInState(this.state, dockWidth));
	}

	setCuratedPanelWidth(curatedPanelWidth: number): void {
		this.setWorkspaceState(
			setCuratedPanelWidthInState(this.state, curatedPanelWidth),
		);
	}

	setDockFocusOnSelect(focusOnSelect: boolean): void {
		this.setWorkspaceState(
			setDockFocusOnSelectInState(this.state, focusOnSelect),
		);
	}

	updateDockNotePath(oldPath: string, newPath: string): boolean {
		const result = updateDockNotePathInState(this.state, oldPath, newPath);
		this.setWorkspaceState(result.state);
		return result.changed;
	}

	updateCuratedFilePath(oldPath: string, newPath: string): boolean {
		const state = renameCuratedFilePathInState(this.state, oldPath, newPath);
		if (state === this.state) {
			return false;
		}
		this.setWorkspaceState(state);
		return true;
	}

	removeDockNote(path: NodeId): void {
		this.setWorkspaceState(removeDockNoteInState(this.state, path));
	}

	reorderDockNote(
		path: NodeId,
		targetPath: NodeId,
		placement: ReorderPlacement,
	): void {
		this.setWorkspaceState(
			reorderDockNoteInState(this.state, path, targetPath, placement),
		);
	}

	async connectDockNote(
		notePath: NodeId,
		targetNodeId: NodeId,
		direction: DockConnectionDirection = 'from-graph-to-dock',
		field = this.state.activeConnectionField,
	): Promise<void> {
		const normalizedField = field.trim();
		if (!normalizedField) {
			return;
		}
		this.setActiveConnectionField(normalizedField);
		const changed = await this.connectionService.connectDockNote(
			notePath,
			targetNodeId,
			direction,
			normalizedField,
			this.getConnectionModeForField(normalizedField),
		);
		this.afterConnectionChange(changed);
	}

	async createNoteFromTemplate(
		templateId: string,
		targetNodeId: NodeId,
		name: string,
		direction: DockConnectionDirection = 'from-dock-to-graph',
		field = this.state.activeConnectionField,
	): Promise<string> {
		const { template, title } = resolveTemplateNoteRequest(
			this.state.dock.templates,
			templateId,
			name,
		);
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
		this.setWorkspaceState(updateQueryInState(this.state, patch), true);
	}

	updateGlobalQuery(patch: Partial<Omit<GraphQuery, 'roots'>>): void {
		this.setWorkspaceState(updateGlobalQueryInState(this.state, patch), true);
	}

	setGlobalNodeStyleRules(nodeStyleRules: NodeStyleRule[]): void {
		this.setWorkspaceState(
			setGlobalNodeStyleRulesInState(this.state, nodeStyleRules),
		);
	}

	setGlobalLinkStyleRules(linkStyleRules: LinkStyleRule[]): void {
		this.setWorkspaceState(
			setGlobalLinkStyleRulesInState(this.state, linkStyleRules),
		);
	}

	setDefaultNodeStyle(defaultNodeStyle: Required<DefaultNodeStyle>): void {
		this.setWorkspaceState(
			setDefaultNodeStyleInState(this.state, defaultNodeStyle),
		);
	}

	setDefaultLinkStyle(defaultLinkStyle: Required<DefaultLinkStyle>): void {
		this.setWorkspaceState(
			setDefaultLinkStyleInState(this.state, defaultLinkStyle),
		);
	}

	setNodeStyleOverrides(nodeStyleOverrides: DefaultNodeStyle): void {
		this.setWorkspaceState(
			setNodeStyleOverridesInState(this.state, nodeStyleOverrides),
		);
	}

	setLinkStyleOverrides(linkStyleOverrides: DefaultLinkStyle): void {
		this.setWorkspaceState(
			setLinkStyleOverridesInState(this.state, linkStyleOverrides),
		);
	}

	setNodeStyleRules(nodeStyleRules: NodeStyleRule[]): void {
		this.setWorkspaceState(setNodeStyleRulesInState(this.state, nodeStyleRules));
	}

	setLinkStyleRules(linkStyleRules: LinkStyleRule[]): void {
		this.setWorkspaceState(setLinkStyleRulesInState(this.state, linkStyleRules));
	}

	setActiveConnectionField(field: string): void {
		const result = setActiveConnectionFieldInState(this.state, field);
		this.setWorkspaceState(result.state, result.runQuery);
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
		this.setWorkspaceState(removeConnectionFieldFromState(this.state, id));
	}

	reorderConnectionField(
		id: string,
		targetId: string,
		placement: ReorderPlacement,
	): void {
		this.setWorkspaceState(
			reorderConnectionFieldInState(this.state, id, targetId, placement),
		);
	}

	setConnectionFieldMode(field: string, mode: ConnectionFieldMode): void {
		this.setWorkspaceState(
			setConnectionFieldModeInState(this.state, field, mode),
		);
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
		this.setActiveConnectionField(normalizedField);
		const changed = await this.connectionService.connectNodes(
			sourceNodeId,
			targetNodeId,
			normalizedField,
			this.getConnectionModeForField(normalizedField),
		);
		this.afterConnectionChange(changed);
	}

	async undoLastConnection(): Promise<void> {
		const changed = await this.connectionService.undoLastConnection();
		this.updateConnectionUndoCount();
		if (changed) {
			this.scheduleRefresh();
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

	private setWorkspaceState(state: WorkspaceState, runQuery = false): boolean {
		if (state === this.state) {
			return false;
		}
		this.state = state;
		if (runQuery) {
			this.runQuery();
		} else {
			this.emit();
		}
		return true;
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener(this.state);
		}
	}

	private afterConnectionChange(changed: boolean): void {
		if (!changed) {
			return;
		}
		this.updateConnectionUndoCount();
		this.scheduleRefresh(
			this.state.mode === 'flow' && this.relayoutFlowAfterConnection,
		);
	}

	private updateConnectionUndoCount(): void {
		const connectionUndoCount = this.connectionService.undoCount;
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
		key: GraphForceSettingKey,
		value: number,
	): void {
		this.setWorkspaceState(setGraphForceSettingInState(this.state, key, value));
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

}

function mapSetsToRecord(
	map: Map<string, Set<string>> | undefined,
): Record<string, string[]> {
	return Object.fromEntries(
		[...(map?.entries() ?? [])].map(([key, values]) => [key, [...values]]),
	);
}
