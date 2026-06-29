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
import { createWorkspaceState } from './workspace-state';
import {
	createDefaultCuratedWorkspace,
	createDefaultChart,
	DEFAULT_CONNECTION_FIELD_MODE,
	serializeMetaGraphState,
} from './meta-graph-model';
import {
	setArcDirectionInState,
	setArcSpacingInState,
	setCubeFaceOpacityInState,
	setDefaultLinkStyleInState,
	setDefaultNodeStyleInState,
	setEnableForceLayoutInState,
	setFadeDistanceInState,
	setFlowDirectionInState,
	setFlowEdgeStyleInState,
	setFlowSpacingInState,
	setForceLabelsInState,
	setGlobalLinkStyleRulesInState,
	setGlobalNodeStyleRulesInState,
	setGraphForceSettingInState,
	setGraphSpacingInState,
	setLabelBackgroundOpacityInState,
	setLabelColorInState,
	setLabelDensityInState,
	setLabelPositionInState,
	setLabelSizeInState,
	setLinkStyleOverridesInState,
	setLinkStyleRulesInState,
	setNodeStyleOverridesInState,
	setNodeStyleRulesInState,
	type GraphForceSettingKey,
} from './workspace-chart-settings';
import {
	addConnectionFieldToState,
	findConnectionFieldSpec,
	removeConnectionFieldFromState,
	reorderConnectionFieldInState,
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
	addDockNote as addDockNoteToState,
	addDockTemplate as addDockTemplateToState,
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
	createUniqueDefaultGroup,
	findManualPlacement,
	getManualGroup,
	moveManualNodesToGroup,
	normalizeCubeLayout,
	normalizeGroupPatch,
	readGroupPlacementBounds,
} from './workspace-manual-layout';
import {
	WorkspaceProjectionService,
	buildWorkspaceIndex,
} from './workspace-query-service';
import { updateActiveChartState } from './workspace-state-updaters';
import { createTemplateNoteFile } from './workspace-template-service';
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
		const state = renameCuratedFilePathInState(this.state, oldPath, newPath);
		if (state === this.state) {
			return false;
		}
		this.setWorkspaceState(state);
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
