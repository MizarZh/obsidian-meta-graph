import { TFile, TFolder, type App } from 'obsidian';
import { MetadataIndexer } from '../core/metadata-indexer';
import { normalizePath } from '../core/knowledge-index';
import { extractLinkText } from '../core/link-resolver';
import type {
	ArcDirection,
	ChartSource,
	CuratedWorkspaceConfig,
	DebugSnapshot,
	FlowDirection,
	FlowEdgeStyle,
	GraphQuery,
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
					globalQuery: this.state.globalQuery,
					globalStyle: {
						nodeRules: this.state.globalNodeStyleRules,
						linkRules: this.state.globalLinkStyleRules,
					},
					activeChart: chart.id,
					connectionFields: this.state.connectionFields,
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
		this.state = this.updateActiveChart(
			{
				type,
				layout: defaultChart.layout,
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
			true,
		);
		this.emit();
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

	addCuratedFile(path: NodeId): void {
		this.addCuratedFiles([path]);
	}

	addCuratedFiles(paths: NodeId[]): void {
		const activeChart = this.getActiveChart();
		const update = addCuratedFilePaths(activeChart.curated, paths);
		if (!update.changed) {
			return;
		}
		this.state = this.updateActiveChart({ curated: update.curated }, true);
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
		const activeChart = this.getActiveChart();
		if (activeChart.source === 'curated') {
			this.state = {
				...this.state,
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
			activeConnectionField: normalized,
		};
		this.runQuery();
	}

	addConnectionField(field: string): void {
		const normalized = field.trim();
		if (!normalized) {
			return;
		}
		const connectionFields = normalizeConnectionFields([
			...this.state.connectionFields,
			normalized,
		]);
		this.state = {
			...this.state,
			connectionFields,
		};
		this.setActiveConnectionField(normalized);
	}

	removeConnectionField(field: string): void {
		const normalized = field.trim();
		if (!normalized) {
			return;
		}
		const connectionFields = normalizeConnectionFields(
			this.state.connectionFields.filter((item) => item !== normalized),
			);
			const activeConnectionField =
				this.state.activeConnectionField === normalized
					? (connectionFields[0] ?? '')
					: this.state.activeConnectionField;
		this.state = {
			...this.state,
			connectionFields,
			activeConnectionField,
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
		let undo: ConnectionUndoEntry | undefined;
		await this.app.fileManager.processFrontMatter(sourceFile, (frontmatter) => {
			const data = asFrontmatterRecord(frontmatter);
			const hadField = Object.prototype.hasOwnProperty.call(
				data,
				normalizedField,
			);
			const currentValue = data[normalizedField];
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
			data[normalizedField] = [...currentValues, link];
		});
		if (undo) {
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
			const sourceFile = this.app.vault.getAbstractFileByPath(undo.sourcePath);
			if (!(sourceFile instanceof TFile)) {
				continue;
			}

			let changed = false;
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
				forceLabels: nextChart.display.forceLabels,
				enableForceLayout: nextChart.display.enableForceLayout,
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
			curated: cloneSerializable(nextChart.curated),
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

function mapSetsToRecord(
	map: Map<string, Set<string>> | undefined,
): Record<string, string[]> {
	return Object.fromEntries(
		[...(map?.entries() ?? [])].map(([key, values]) => [key, [...values]]),
	);
}
