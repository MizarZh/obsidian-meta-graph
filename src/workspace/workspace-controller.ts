import { TFile, type App } from 'obsidian';
import type {
	ArcDirection,
	ArcLabelAngle,
	ChartStyleConfig,
	ChartSource,
	ChartGroup,
	ConnectionFieldMode,
	CreateChartInput,
	CuratedWorkspaceConfig,
	DefaultLinkStyle,
	DefaultNodeStyle,
	DebugSnapshot,
	FlowDirection,
	FlowEdgeStyle,
	FlowRelationRule,
	GraphQuery,
	KnowledgeEdge,
	KnowledgeNode,
	LabelPosition,
	LayoutNodeSort,
	LayoutSortDirection,
	LinkStyleRule,
	MetaGraphDocument,
	DockConnectionDirection,
	DockTemplateNode,
	NodeId,
	NodeStyleRule,
	RendererDebugState,
	ThreeLabelResolution,
	ViewMode,
	WorkspacePerformanceSample,
	WorkspaceState,
} from '../core/types';
import { createWorkspaceState } from './state/workspace-state';
import { serializeMetaGraphState } from './meta-graph-model';
import {
	setArcDirectionInState,
	setArcLabelAngleInState,
	setArcSpacingInState,
	setCubeFaceOpacityInState,
	setCubeFreeCameraInState,
	setCubeSizeInState,
	setEnableForceLayoutInState,
	setFadeDistanceInState,
	setFlowDirectionInState,
	setFlowEdgeStyleInState,
	setFlowCornerRadiusInState,
	setFlowLaneSpacingInState,
	setFlowLayerSpacingInState,
	setFlowRelationRulesInState,
	setFlowSpacingInState,
	setForceLabelsInState,
	setGraphForceSettingInState,
	setGraphSpacingInState,
	setLabelBoldInState,
	setLabelItalicInState,
	setLabelDarkBackgroundColorInState,
	setLabelDarkBackgroundOpacityInState,
	setLabelDarkTextColorInState,
	setLabelDensityInState,
	setLabelLightBackgroundColorInState,
	setLabelLightBackgroundOpacityInState,
	setLabelLightTextColorInState,
	setLabelOffsetInState,
	setLabelPositionInState,
	setLabelSizeInState,
	setScaleLabelsWithZoomInState,
	setThreeLabelResolutionInState,
	setLayoutNodeSortInState,
	setLayoutSortDirectionInState,
	type GraphForceSettingKey,
} from './state/chart-settings';
import {
	setDefaultLinkStyleInState,
	setDefaultNodeStyleInState,
	setChartStyleInState,
	setGlobalLinkStyleRulesInState,
	setGlobalNodeStyleRulesInState,
	setLinkStyleOverridesInState,
	setLinkStyleRulesInState,
	moveLinkStyleRuleToScopeInState,
	moveNodeStyleRuleToScopeInState,
	setNodeStyleOverridesInState,
	setUnresolvedNodeStyleOverridesInState,
	setNodeStyleRulesInState,
	setPlainLinkStyleOverridesInState,
	setUnresolvedLinkStyleOverridesInState,
} from './state/style-state';
import {
	addConnectionFieldAndSelectInState,
	removeConnectionFieldFromState,
	reorderConnectionFieldInState,
	setActiveConnectionFieldInState,
	updateConnectionFieldInState,
} from './state/connection-fields';
import { createObsidianConnectionService } from './services/connection-adapter';
import {
	addCuratedFileInState,
	addCuratedFilesActionInState,
	clearCuratedFilesActionInState,
	removeCuratedFileInState,
	removeCuratedFilesActionInState,
	reorderCuratedFileActionInState,
	reorderCuratedFilesActionInState,
	setCuratedFilesHiddenActionInState,
	updateCuratedFilePathActionInState,
	updateCuratedWorkspaceActionInState,
	type WorkspaceCuratedActionResult,
} from './actions/curated-actions';
import {
	addDockNoteInState,
	addDockNotesInState,
	addDockTemplateInState,
	removeDockNoteInState,
	removeDockTemplateInState,
	reorderDockNoteInState,
	reorderDockNotesInState,
	reorderDockTemplateInState,
	reorderDockTemplatesInState,
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
	reorderGroupInState,
	resizeGroupInState,
	setManualNodePositionInState,
	setNodeGroupInState,
	updateGroupInState,
} from './state/manual-layout-state';
import type { WorkspaceIndexService } from './services/workspace-index-service';
import {
	hoverNodeInState,
	openWorkspaceNode,
	selectEdgeInState,
	selectGroupInState,
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
	duplicateActiveChartInState,
	duplicateActiveChartAndSetSourceInState,
	duplicateActiveChartAndSetTypeInState,
	setActiveChartInState,
	setActiveChartNameInState,
	setActiveChartSourceInState,
	setActiveChartTypeInState,
} from './state/chart-state';
import { createTemplateNoteFile } from './services/template-service';
import { updateWorkspaceReferencesInState } from './state/reference-walker';
import {
	WorkspaceStore,
	type WorkspaceStateListener,
} from './controller/workspace-store';
import { WorkspaceRefreshCoordinator } from './controller/workspace-refresh-coordinator';
import { WorkspaceConnectionCoordinator } from './controller/workspace-connection-coordinator';
import { WorkspaceTemplateCoordinator } from './controller/workspace-template-coordinator';

export class WorkspaceController {
	private readonly store: WorkspaceStore;
	private readonly refreshCoordinator: WorkspaceRefreshCoordinator;
	private readonly connectionCoordinator: WorkspaceConnectionCoordinator<TFile>;
	private readonly templateCoordinator: WorkspaceTemplateCoordinator;
	private rendererDebugState: RendererDebugState = { status: 'idle' };

	constructor(
		private readonly app: App,
		private readonly workspaceIndex: WorkspaceIndexService,
		maxNodes: number,
		debug: boolean,
		relayoutFlowAfterConnection: boolean,
		fadeDistance = 1.5,
		document?: MetaGraphDocument,
		readOnly = false,
	) {
		this.store = new WorkspaceStore(
			createWorkspaceState(maxNodes, fadeDistance, document),
		);
		this.refreshCoordinator = new WorkspaceRefreshCoordinator(
			this.workspaceIndex,
			this.store,
			debug,
		);
		this.connectionCoordinator = new WorkspaceConnectionCoordinator(
			{
				store: this.store,
				service: createObsidianConnectionService(this.app),
				readOnly,
				commit: (state, runQuery) =>
					this.setWorkspaceState(state, runQuery),
				scheduleRefresh: (forceLayout) =>
					this.refreshCoordinator.schedule(forceLayout),
			},
			relayoutFlowAfterConnection,
		);
		this.templateCoordinator = new WorkspaceTemplateCoordinator({
			store: this.store,
			readOnly,
			createNoteFile: (template, title) =>
				createTemplateNoteFile(this.app, template, title),
			connectDockNote: (notePath, targetNodeId, direction, field) =>
				this.connectionCoordinator.connectDockNote(
					notePath,
					targetNodeId,
					direction,
					field,
				),
			commit: (state) => this.setWorkspaceState(state),
		});
	}

	private get state(): WorkspaceState {
		return this.store.snapshot;
	}

	get snapshot(): WorkspaceState {
		return this.state;
	}

	getIndexedNodes(): KnowledgeNode[] {
		return this.refreshCoordinator.getIndexedNodes();
	}

	getIndexedEdges(): KnowledgeEdge[] {
		return this.refreshCoordinator.getIndexedEdges();
	}

	isLargeVaultModeActive(): boolean {
		return this.workspaceIndex.isLargeVaultModeActive();
	}

	recordPerformance(
		name: string,
		durationMs: number,
		details?: WorkspacePerformanceSample['details'],
	): void {
		this.refreshCoordinator.recordPerformance(name, durationMs, details);
	}

	getDebugSnapshot(state: WorkspaceState = this.state): DebugSnapshot {
		return this.refreshCoordinator.getDebugSnapshot(
			state,
			this.rendererDebugState,
		);
	}

	setRendererDebugState(rendererDebugState: RendererDebugState): void {
		this.rendererDebugState = rendererDebugState;
		this.store.emit();
	}

	setFlowRelationConflictCount(flowRelationConflictCount: number): void {
		if (
			this.state.flowRelationConflictCount === flowRelationConflictCount
		) {
			return;
		}
		this.store.replace({ ...this.state, flowRelationConflictCount });
	}

	setRelayoutFlowAfterConnection(value: boolean): void {
		this.connectionCoordinator.setRelayoutFlowAfterConnection(value);
	}

	subscribe(listener: WorkspaceStateListener): () => void {
		return this.store.subscribe(listener);
	}

	initialize(initialFile: TFile | null): void {
		this.setCurrentFile(initialFile);
		this.refreshCoordinator.initialize();
	}

	scheduleRefresh(forceLayout = false): void {
		this.refreshCoordinator.schedule(forceLayout);
	}

	async refresh(forceLayout = false): Promise<void> {
		await this.refreshCoordinator.refresh(forceLayout);
	}

	setCurrentFile(file: TFile | null): void {
		this.setWorkspaceState(setCurrentFileInState(this.state, file?.path));
	}

	setActiveChart(activeChartId: string): void {
		const result = setActiveChartInState(this.state, activeChartId);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	addChart(input: CreateChartInput): void {
		const result = addChartInState(this.state, input);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	duplicateActiveChart(): void {
		const result = duplicateActiveChartInState(this.state);
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

	setActiveChartSource(
		source: ChartSource,
		curatedPaths: readonly string[] = [],
	): void {
		const result = setActiveChartSourceInState(
			this.state,
			source,
			curatedPaths,
		);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	duplicateActiveChartAndSetType(type: ViewMode): void {
		const result = duplicateActiveChartAndSetTypeInState(this.state, type);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	duplicateActiveChartAndSetSource(
		source: ChartSource,
		curatedPaths: readonly string[] = [],
	): void {
		const result = duplicateActiveChartAndSetSourceInState(
			this.state,
			source,
			curatedPaths,
		);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	deleteActiveChart(): void {
		const result = deleteActiveChartInState(this.state);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	setFlowEdgeStyle(flowEdgeStyle: FlowEdgeStyle): void {
		this.setWorkspaceState(
			setFlowEdgeStyleInState(this.state, flowEdgeStyle),
		);
	}

	setFlowDirection(flowDirection: FlowDirection): void {
		this.setWorkspaceState(
			setFlowDirectionInState(this.state, flowDirection),
		);
	}

	setFlowRelationRules(flowRelationRules: FlowRelationRule[]): void {
		this.setWorkspaceState(
			setFlowRelationRulesInState(this.state, flowRelationRules),
		);
	}

	setArcDirection(arcDirection: ArcDirection): void {
		this.setWorkspaceState(
			setArcDirectionInState(this.state, arcDirection),
		);
	}

	setArcLabelAngle(arcLabelAngle: ArcLabelAngle): void {
		this.setWorkspaceState(
			setArcLabelAngleInState(this.state, arcLabelAngle),
		);
	}

	setLayoutNodeSort(nodeSort: LayoutNodeSort): void {
		this.setWorkspaceState(setLayoutNodeSortInState(this.state, nodeSort));
	}

	setLayoutSortDirection(nodeSortDirection: LayoutSortDirection): void {
		this.setWorkspaceState(
			setLayoutSortDirectionInState(this.state, nodeSortDirection),
		);
	}

	setFadeDistance(fadeDistance: number): void {
		this.setWorkspaceState(
			setFadeDistanceInState(this.state, fadeDistance),
		);
	}

	setLabelSize(labelSize: number): void {
		this.setWorkspaceState(setLabelSizeInState(this.state, labelSize));
	}

	setScaleLabelsWithZoom(scaleLabelsWithZoom: boolean): void {
		this.setWorkspaceState(
			setScaleLabelsWithZoomInState(this.state, scaleLabelsWithZoom),
		);
	}

	setThreeLabelResolution(resolution: ThreeLabelResolution): void {
		this.setWorkspaceState(
			setThreeLabelResolutionInState(this.state, resolution),
		);
	}

	setLabelBold(labelBold: boolean): void {
		this.setWorkspaceState(setLabelBoldInState(this.state, labelBold));
	}

	setLabelItalic(labelItalic: boolean): void {
		this.setWorkspaceState(setLabelItalicInState(this.state, labelItalic));
	}

	setLabelPosition(labelPosition: LabelPosition): void {
		this.setWorkspaceState(
			setLabelPositionInState(this.state, labelPosition),
		);
	}

	setLabelOffset(labelOffset: number): void {
		this.setWorkspaceState(setLabelOffsetInState(this.state, labelOffset));
	}

	setLabelLightTextColor(labelLightTextColor: string): void {
		this.setWorkspaceState(
			setLabelLightTextColorInState(this.state, labelLightTextColor),
		);
	}

	setLabelLightBackgroundColor(labelLightBackgroundColor: string): void {
		this.setWorkspaceState(
			setLabelLightBackgroundColorInState(
				this.state,
				labelLightBackgroundColor,
			),
		);
	}

	setLabelLightBackgroundOpacity(value: number): void {
		this.setWorkspaceState(
			setLabelLightBackgroundOpacityInState(this.state, value),
		);
	}

	setLabelDarkTextColor(labelDarkTextColor: string): void {
		this.setWorkspaceState(
			setLabelDarkTextColorInState(this.state, labelDarkTextColor),
		);
	}

	setLabelDarkBackgroundColor(labelDarkBackgroundColor: string): void {
		this.setWorkspaceState(
			setLabelDarkBackgroundColorInState(
				this.state,
				labelDarkBackgroundColor,
			),
		);
	}

	setLabelDarkBackgroundOpacity(value: number): void {
		this.setWorkspaceState(
			setLabelDarkBackgroundOpacityInState(this.state, value),
		);
	}

	setLabelDensity(labelDensity: number): void {
		this.setWorkspaceState(
			setLabelDensityInState(this.state, labelDensity),
		);
	}

	setCubeFaceOpacity(cubeFaceOpacity: number): void {
		this.setWorkspaceState(
			setCubeFaceOpacityInState(this.state, cubeFaceOpacity),
		);
	}

	setCubeSize(cubeSize: number): void {
		this.setWorkspaceState(setCubeSizeInState(this.state, cubeSize));
	}

	setCubeFreeCamera(cubeFreeCamera: boolean): void {
		this.setWorkspaceState(
			setCubeFreeCameraInState(this.state, cubeFreeCamera),
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

	setNodeGroup(nodeId: NodeId, groupId?: string | null): void {
		this.setWorkspaceState(
			setNodeGroupInState(this.state, nodeId, groupId),
		);
	}

	reorderGroup(groupId: string, direction: -1 | 1): void {
		this.setWorkspaceState(
			reorderGroupInState(this.state, groupId, direction),
		);
	}

	addGroup(): void {
		this.setWorkspaceState(addGroupInState(this.state));
	}

	updateGroup(groupId: string, patch: Partial<ChartGroup>): void {
		this.setWorkspaceState(updateGroupInState(this.state, groupId, patch));
	}

	moveGroup(
		groupId: string,
		delta: { x: number; y: number },
		positions?: Readonly<Record<NodeId, { x: number; y: number }>>,
	): void {
		this.setWorkspaceState(
			moveGroupInState(this.state, groupId, delta, positions),
		);
	}

	resizeGroup(
		groupId: string,
		geometry: Pick<ChartGroup, 'x' | 'y' | 'width' | 'height'>,
	): void {
		this.setWorkspaceState(
			resizeGroupInState(this.state, groupId, geometry),
		);
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
		this.setWorkspaceState(
			setGraphSpacingInState(this.state, graphSpacing),
		);
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

	setFlowLayerSpacing(flowLayerSpacing: number): void {
		this.setWorkspaceState(
			setFlowLayerSpacingInState(this.state, flowLayerSpacing),
		);
	}

	setFlowLaneSpacing(flowLaneSpacing: number): void {
		this.setWorkspaceState(
			setFlowLaneSpacingInState(this.state, flowLaneSpacing),
		);
	}

	setFlowCornerRadius(flowCornerRadius: number): void {
		this.setWorkspaceState(
			setFlowCornerRadiusInState(this.state, flowCornerRadius),
		);
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
		this.applyCuratedActionResult(
			removeCuratedFileInState(this.state, path),
		);
	}

	removeCuratedFiles(paths: NodeId[]): void {
		this.applyCuratedActionResult(
			removeCuratedFilesActionInState(this.state, paths),
		);
	}

	setCuratedFilesHidden(paths: NodeId[], hidden: boolean): void {
		this.applyCuratedActionResult(
			setCuratedFilesHiddenActionInState(this.state, paths, hidden),
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

	reorderCuratedFiles(orderedPaths: NodeId[]): void {
		this.applyCuratedActionResult(
			reorderCuratedFilesActionInState(this.state, orderedPaths),
		);
	}

	clearCuratedFiles(): void {
		this.applyCuratedActionResult(
			clearCuratedFilesActionInState(this.state),
		);
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
		this.setWorkspaceState(
			removeDockTemplateInState(this.state, templateId),
		);
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

	reorderDockTemplates(orderedTemplateIds: string[]): void {
		this.setWorkspaceState(
			reorderDockTemplatesInState(this.state, orderedTemplateIds),
		);
	}

	addDockNote(path: NodeId): void {
		this.setWorkspaceState(addDockNoteInState(this.state, path));
	}

	addDockNotes(paths: NodeId[]): void {
		this.setWorkspaceState(addDockNotesInState(this.state, paths));
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

	updateFileReferences(oldPath: string, newPath: string): boolean {
		const result = updateWorkspaceReferencesInState(
			this.state,
			oldPath,
			newPath,
		);
		this.setWorkspaceState(result.state, result.changed);
		return result.changed;
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

	reorderDockNotes(orderedPaths: NodeId[]): void {
		this.setWorkspaceState(
			reorderDockNotesInState(this.state, orderedPaths),
		);
	}

	async connectDockNote(
		notePath: NodeId,
		targetNodeId: NodeId,
		direction: DockConnectionDirection = 'from-graph-to-dock',
		field = this.state.activeConnectionField,
	): Promise<void> {
		await this.connectionCoordinator.connectDockNote(
			notePath,
			targetNodeId,
			direction,
			field,
		);
	}

	async createNoteFromTemplate(
		templateId: string,
		targetNodeId: NodeId,
		name: string,
		direction: DockConnectionDirection = 'from-dock-to-graph',
		field = this.state.activeConnectionField,
	): Promise<string> {
		return this.templateCoordinator.createNote(
			templateId,
			targetNodeId,
			name,
			direction,
			field,
		);
	}

	async createStandaloneNoteFromTemplate(
		templateId: string,
		name: string,
	): Promise<string> {
		return this.templateCoordinator.createStandaloneNote(templateId, name);
	}

	updateQuery(patch: Partial<Omit<GraphQuery, 'roots'>>): void {
		this.setWorkspaceState(updateQueryInState(this.state, patch), true);
	}

	updateGlobalQuery(patch: Partial<Omit<GraphQuery, 'roots'>>): void {
		this.setWorkspaceState(
			updateGlobalQueryInState(this.state, patch),
			true,
		);
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

	setUnresolvedNodeStyleOverrides(
		unresolvedNodeStyleOverrides: DefaultNodeStyle,
	): void {
		this.setWorkspaceState(
			setUnresolvedNodeStyleOverridesInState(
				this.state,
				unresolvedNodeStyleOverrides,
			),
		);
	}

	setLinkStyleOverrides(linkStyleOverrides: DefaultLinkStyle): void {
		this.setWorkspaceState(
			setLinkStyleOverridesInState(this.state, linkStyleOverrides),
		);
	}

	setPlainLinkStyleOverrides(
		plainLinkStyleOverrides: DefaultLinkStyle,
	): void {
		this.setWorkspaceState(
			setPlainLinkStyleOverridesInState(
				this.state,
				plainLinkStyleOverrides,
			),
		);
	}

	setUnresolvedLinkStyleOverrides(
		unresolvedLinkStyleOverrides: DefaultLinkStyle,
	): void {
		this.setWorkspaceState(
			setUnresolvedLinkStyleOverridesInState(
				this.state,
				unresolvedLinkStyleOverrides,
			),
		);
	}

	setNodeStyleRules(nodeStyleRules: NodeStyleRule[]): void {
		this.setWorkspaceState(
			setNodeStyleRulesInState(this.state, nodeStyleRules),
		);
	}

	setLinkStyleRules(linkStyleRules: LinkStyleRule[]): void {
		this.setWorkspaceState(
			setLinkStyleRulesInState(this.state, linkStyleRules),
		);
	}

	setChartStyle(style: ChartStyleConfig): void {
		this.setWorkspaceState(setChartStyleInState(this.state, style));
	}

	moveNodeStyleRuleToScope(
		id: string,
		targetScope: 'global' | 'current',
	): void {
		this.setWorkspaceState(
			moveNodeStyleRuleToScopeInState(this.state, id, targetScope),
		);
	}

	moveLinkStyleRuleToScope(
		id: string,
		targetScope: 'global' | 'current',
	): void {
		this.setWorkspaceState(
			moveLinkStyleRuleToScopeInState(this.state, id, targetScope),
		);
	}

	setActiveConnectionField(
		field: string,
		mode: ConnectionFieldMode,
		reverseField?: string,
	): void {
		const result = setActiveConnectionFieldInState(
			this.state,
			field,
			mode,
			reverseField,
		);
		this.setWorkspaceState(result.state, result.runQuery);
	}

	addConnectionField(
		field: string,
		mode: ConnectionFieldMode,
		reverseField?: string,
	): void {
		const result = addConnectionFieldAndSelectInState(
			this.state,
			field,
			mode,
			reverseField,
		);
		if (this.setWorkspaceState(result.state, result.runQuery)) {
			this.scheduleRefresh();
		}
	}

	removeConnectionField(id: string): void {
		if (
			this.setWorkspaceState(
				removeConnectionFieldFromState(this.state, id),
			)
		) {
			this.scheduleRefresh();
		}
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

	updateConnectionField(
		id: string,
		field: string,
		mode: ConnectionFieldMode,
		reverseField?: string,
	): void {
		if (
			this.setWorkspaceState(
				updateConnectionFieldInState(
					this.state,
					id,
					field,
					mode,
					reverseField,
				),
			)
		) {
			this.scheduleRefresh();
		}
	}

	selectNode(selectedNodeId?: NodeId): void {
		this.setWorkspaceState(selectNodeInState(this.state, selectedNodeId));
	}

	selectEdge(selectedEdgeId: string): void {
		this.setWorkspaceState(selectEdgeInState(this.state, selectedEdgeId));
	}

	selectGroup(selectedGroupId: string): void {
		this.setWorkspaceState(selectGroupInState(this.state, selectedGroupId));
	}

	hoverNode(hoveredNodeId?: NodeId): void {
		this.setWorkspaceState(hoverNodeInState(this.state, hoveredNodeId));
	}

	async openNode(nodeId: NodeId): Promise<void> {
		await openWorkspaceNode(nodeId, {
			getFile: (path) => this.app.vault.getAbstractFileByPath(path),
			isFile: (value): value is TFile => value instanceof TFile,
			openFile: (file) =>
				this.app.workspace.getLeaf('tab').openFile(file),
		});
	}

	async connectNodes(
		sourceNodeId: NodeId,
		targetNodeId: NodeId,
		field = this.state.activeConnectionField,
	): Promise<void> {
		await this.connectionCoordinator.connectNodes(
			sourceNodeId,
			targetNodeId,
			field,
		);
	}

	async undoLastConnection(): Promise<void> {
		await this.connectionCoordinator.undoLastConnection();
	}

	async redoLastConnection(): Promise<void> {
		await this.connectionCoordinator.redoLastConnection();
	}

	dispose(): void {
		this.refreshCoordinator.dispose();
		this.store.dispose();
	}

	private setWorkspaceState(
		state: WorkspaceState,
		runQuery = false,
	): boolean {
		if (state === this.state) {
			return false;
		}
		if (runQuery) {
			this.store.replace(state, false);
			this.refreshCoordinator.runQuery();
		} else {
			this.store.replace(state);
		}
		return true;
	}

	private applyCuratedActionResult(
		result: WorkspaceCuratedActionResult,
	): void {
		this.setWorkspaceState(result.state, result.runQuery);
	}

	private setGraphForceSetting(
		key: GraphForceSettingKey,
		value: number,
	): void {
		this.setWorkspaceState(
			setGraphForceSettingInState(this.state, key, value),
		);
	}
}
