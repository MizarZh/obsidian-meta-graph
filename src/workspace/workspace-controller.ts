import { TFile, type App } from 'obsidian';
import type {
	ArcDirection,
	ChartSource,
	ChartGroup,
	ConnectionFieldMode,
	CuratedWorkspaceConfig,
	DefaultLinkStyle,
	DefaultNodeStyle,
	DebugSnapshot,
	FlowDirection,
	FlowEdgeStyle,
	GraphQuery,
	KnowledgeIndex,
	LabelPosition,
		LinkStyleRule,
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
import { createWorkspaceState } from './state/workspace-state';
import { serializeMetaGraphState } from './meta-graph-model';
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
} from './state/chart-settings';
import {
	setDefaultLinkStyleInState,
	setDefaultNodeStyleInState,
	setGlobalLinkStyleRulesInState,
	setGlobalNodeStyleRulesInState,
	setLinkStyleOverridesInState,
	setLinkStyleRulesInState,
	setNodeStyleOverridesInState,
	setNodeStyleRulesInState,
} from './state/style-state';
import {
	addConnectionFieldAndSelectInState,
	getActiveConnectionModeInState,
	removeConnectionFieldFromState,
	reorderConnectionFieldInState,
	setActiveConnectionFieldInState,
	setConnectionFieldModeInState,
} from './state/connection-fields';
import { WorkspaceConnectionService } from './services/connection-service';
import { createObsidianConnectionService } from './services/connection-adapter';
import {
	connectPreparedNodesInState,
	prepareConnectDockNoteInState,
	prepareConnectNodesInState,
	undoLastConnectionInState,
	type WorkspaceConnectionActionResult,
} from './actions/connection-actions';
import {
	addCuratedFileInState,
	addCuratedFilesActionInState,
	clearCuratedFilesActionInState,
	removeCuratedFileInState,
	removeCuratedFilesActionInState,
	reorderCuratedFileActionInState,
	updateCuratedFilePathActionInState,
	updateCuratedWorkspaceActionInState,
	type WorkspaceCuratedActionResult,
} from './actions/curated-actions';
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
} from './actions/dock-actions';
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
} from './state/manual-layout-state';
import {
	WorkspaceProjectionService,
	buildWorkspaceIndex,
} from './services/query-service';
import {
	applyWorkspaceIndexSnapshotToState,
	projectWorkspaceState,
} from './runtime/refresh-state';
import { createWorkspaceDebugSnapshot } from './runtime/debug-snapshot';
import {
	hoverNodeInState,
	openWorkspaceNode,
	selectNodeInState,
	setCurrentFileInState,
} from './actions/file-actions';
import {
	updateGlobalQueryInState,
	updateQueryInState,
} from './state/query-state';
import {
	addChartInState,
	deleteActiveChartInState,
	setActiveChartInState,
	setActiveChartNameInState,
	setActiveChartSourceInState,
	setActiveChartTypeInState,
} from './state/chart-state';
import { createTemplateNoteFile } from './services/template-service';
import { createWorkspaceTemplateNote } from './actions/template-actions';

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
		this.connectionService = createObsidianConnectionService(this.app);
	}

	get snapshot(): WorkspaceState {
		return this.state;
	}

	getDebugSnapshot(state: WorkspaceState = this.state): DebugSnapshot {
		return createWorkspaceDebugSnapshot({
			state,
			index: this.index,
			unresolvedLinks: this.unresolvedLinks,
			metadataSources: this.metadataSources,
			rendererDebugState: this.rendererDebugState,
		});
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
		this.state = applyWorkspaceIndexSnapshotToState(
			this.state,
			indexSnapshot,
			forceLayout,
		);
		this.runQuery();
	}

	setCurrentFile(file: TFile | null): void {
		this.setWorkspaceState(setCurrentFileInState(this.state, file?.path));
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
		this.applyCuratedActionResult(
			addCuratedFileInState(this.state, path, groupId),
		);
	}

	addCuratedFiles(paths: NodeId[], groupId?: string): void {
		this.applyCuratedActionResult(
			addCuratedFilesActionInState(this.state, paths, groupId),
		);
	}

	removeCuratedFile(path: NodeId): void {
		this.applyCuratedActionResult(removeCuratedFileInState(this.state, path));
	}

	removeCuratedFiles(paths: NodeId[]): void {
		this.applyCuratedActionResult(
			removeCuratedFilesActionInState(this.state, paths),
		);
	}

	reorderCuratedFile(
		path: NodeId,
		targetPath: NodeId,
		placement: ReorderPlacement,
	): void {
		this.applyCuratedActionResult(
			reorderCuratedFileActionInState(
				this.state,
				path,
				targetPath,
				placement,
			),
		);
	}

	clearCuratedFiles(): void {
		this.applyCuratedActionResult(clearCuratedFilesActionInState(this.state));
	}

	updateCuratedWorkspace(patch: Partial<CuratedWorkspaceConfig>): void {
		this.applyCuratedActionResult(
			updateCuratedWorkspaceActionInState(this.state, patch),
		);
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
		const result = updateCuratedFilePathActionInState(
			this.state,
			oldPath,
			newPath,
		);
		if (!result.changed) {
			return false;
		}
		this.applyCuratedActionResult(result);
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
		const action = prepareConnectDockNoteInState(
			this.state,
			notePath,
			targetNodeId,
			direction,
			field,
		);
		if (!action) {
			return;
		}
		this.setWorkspaceState(action.state, action.runQuery);
		this.applyConnectionActionResult(
			await connectPreparedNodesInState(
				this.state,
				this.connectionService,
				action,
				this.relayoutFlowAfterConnection,
			),
		);
	}

	async createNoteFromTemplate(
		templateId: string,
		targetNodeId: NodeId,
		name: string,
		direction: DockConnectionDirection = 'from-dock-to-graph',
		field = this.state.activeConnectionField,
	): Promise<string> {
		return createWorkspaceTemplateNote({
			templates: this.state.dock.templates,
			templateId,
			targetNodeId,
			name,
			direction,
			field,
			createNoteFile: (template, title) =>
				createTemplateNoteFile(this.app, template, title),
			connectDockNote: (notePath, target, dockDirection, connectionField) =>
				this.connectDockNote(notePath, target, dockDirection, connectionField),
			placeTemplateNoteInDefaultGroup: (path, groupId) => {
				this.setWorkspaceState(
					placeNodeInDefaultGroupInState(this.state, path, groupId),
				);
			},
		});
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
		const result = addConnectionFieldAndSelectInState(
			this.state,
			field,
			getActiveConnectionModeInState(this.state),
		);
		this.setWorkspaceState(result.state, result.runQuery);
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
		this.setWorkspaceState(selectNodeInState(this.state, selectedNodeId));
	}

	hoverNode(hoveredNodeId?: NodeId): void {
		this.setWorkspaceState(hoverNodeInState(this.state, hoveredNodeId));
	}

	async openNode(nodeId: NodeId): Promise<void> {
		await openWorkspaceNode(nodeId, {
			getFile: (path) => this.app.vault.getAbstractFileByPath(path),
			isFile: (value): value is TFile => value instanceof TFile,
			openFile: (file) => this.app.workspace.getLeaf('tab').openFile(file),
		});
	}

	async connectNodes(
		sourceNodeId: NodeId,
		targetNodeId: NodeId,
		field = this.state.activeConnectionField,
	): Promise<void> {
		const action = prepareConnectNodesInState(
			this.state,
			sourceNodeId,
			targetNodeId,
			field,
		);
		if (!action) {
			return;
		}
		this.setWorkspaceState(action.state, action.runQuery);
		this.applyConnectionActionResult(
			await connectPreparedNodesInState(
				this.state,
				this.connectionService,
				action,
				this.relayoutFlowAfterConnection,
			),
		);
	}

	async undoLastConnection(): Promise<void> {
		this.applyConnectionActionResult(
			await undoLastConnectionInState(this.state, this.connectionService),
		);
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
		this.state = projectWorkspaceState(
			this.state,
			this.index,
			(index, state) => this.projectionService.project(index, state),
		);
		this.emit();
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

	private applyConnectionActionResult(
		result: WorkspaceConnectionActionResult,
	): void {
		this.setWorkspaceState(result.state);
		if (result.refresh) {
			this.scheduleRefresh(result.forceLayout);
		}
	}

	private applyCuratedActionResult(result: WorkspaceCuratedActionResult): void {
		this.setWorkspaceState(result.state, result.runQuery);
	}

	private setGraphForceSetting(
		key: GraphForceSettingKey,
		value: number,
	): void {
		this.setWorkspaceState(setGraphForceSettingInState(this.state, key, value));
	}

}
