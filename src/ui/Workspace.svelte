<script lang="ts">
	import type { App } from 'obsidian';
	import { onMount } from 'svelte';
	import type {
		DebugSnapshot,
		MetaGraphDocument,
		WorkspaceState,
	} from '../core/types';
	import {
		bindGraphEvents,
		type ConnectionDragState,
	} from '../graph/graph-events';
	import {
		GraphologyAdapter,
		type GraphPosition,
		type RuntimeGraph,
	} from '../graph/graphology-adapter';
	import { readGraphPalette } from '../graph/graph-styles';
	import { SigmaRenderer } from '../graph/sigma-renderer';
	import { ArcLayout } from '../layouts/arc-layout';
	import {
		applyOrthogonalFlowEdges,
		ElkFlowLayout,
		type OrthogonalRouteMap,
	} from '../layouts/elk-flow-layout';
	import { ForceAtlasLayout } from '../layouts/force-layout';
	import type { WorkspaceController } from '../workspace/workspace-controller';
	import { serializeMetaGraphState } from '../workspace/meta-graph-model';
	import FilterPanel from './FilterPanel.svelte';
	import DebugPanel from './DebugPanel.svelte';
	import DockGraphPanel, {
		type DockDragPayload,
	} from './DockGraphPanel.svelte';
	import DisplayControls from './DisplayControls.svelte';
	import Inspector from './Inspector.svelte';
	import ConnectionPanel from './ConnectionPanel.svelte';
	import { ConfirmDeleteViewModal } from './ConfirmDeleteWorkspaceModal';
	import { CreateFromTemplateModal } from './CreateFromTemplateModal';
	import Toolbar from './Toolbar.svelte';

	let {
		app,
		controller,
		onAutoSave,
		workspaceFilePath,
		showDebugButton,
	}: {
		app: App;
		controller: WorkspaceController;
		onAutoSave: (document: MetaGraphDocument) => Promise<void>;
		workspaceFilePath?: string;
		showDebugButton: boolean;
	} = $props();
	let workspaceState: WorkspaceState = $state(getInitialState());
	let workspaceRoot: HTMLDivElement;
	let canvas: HTMLDivElement;
	let renderer: SigmaRenderer | undefined;
	let unbindEvents: (() => void) | undefined;
	let renderVersion = 0;
	let autoSaveTimer: number | undefined;
	let pendingAutoSave: MetaGraphDocument | undefined;
	let lastAutoSavedState = '';
	let lastProjection: WorkspaceState['projection'];
	let lastActiveChartId: string | undefined;
	let lastMode: WorkspaceState['mode'] | undefined;
	let lastFlowEdgeStyle: WorkspaceState['flowEdgeStyle'] | undefined;
	let lastFlowDirection: WorkspaceState['flowDirection'] | undefined;
	let lastArcDirection: WorkspaceState['arcDirection'] | undefined;
	let lastLayoutRevision: number | undefined;
	let lastNodeStyleRules: WorkspaceState['nodeStyleRules'] | undefined;
	let lastLinkStyleRules: WorkspaceState['linkStyleRules'] | undefined;
	let debugOpen = $state(false);
	let graphSettingsOpen = $state(true);
	let connectionDrag = $state<ConnectionDragState | undefined>(undefined);
	let graphConnectionTargetNotePath = $state<string | undefined>(undefined);
	let graphConnectionTargetTemplateId = $state<string | undefined>(undefined);
	let dockDrag = $state<DockDragPayload | undefined>(undefined);
	let dockTargetNodeId = $state<string | undefined>(undefined);
	const DOCK_DRAG_MIME = 'application/x-obsidian-meta-graph-dock-node';
	interface LayoutSnapshot {
		positions: Map<string, GraphPosition>;
		edgeIds: Set<string>;
		orthogonalRoutes: OrthogonalRouteMap;
	}
	const layoutSnapshots = new Map<string, LayoutSnapshot>();

	function getInitialState(): WorkspaceState {
		return controller.snapshot;
	}

	onMount(() => {
		lastAutoSavedState = JSON.stringify(
			serializeMetaGraphState(controller.snapshot),
		);
		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (
				entry &&
				entry.contentRect.width > 0 &&
				entry.contentRect.height > 0
			) {
				renderer?.resize();
			}
		});
		resizeObserver.observe(canvas);
		workspaceRoot.addEventListener('keydown', handleWorkspaceKeydown);
		workspaceRoot.addEventListener('pointerdown', focusWorkspaceForShortcuts);
		window.addEventListener('mousemove', handleGraphConnectionMouseMove, {
			capture: true,
		});
		window.addEventListener('mouseup', handleGraphConnectionMouseUp, {
			capture: true,
		});

		const unsubscribe = controller.subscribe((nextState) => {
			const activeChartChanged =
				lastActiveChartId !== undefined &&
				nextState.activeChartId !== lastActiveChartId;
			const modeChanged =
				lastMode !== undefined && nextState.mode !== lastMode;
			const flowStyleChanged =
				lastFlowEdgeStyle !== undefined &&
				nextState.flowEdgeStyle !== lastFlowEdgeStyle;
			const flowDirectionChanged =
				lastFlowDirection !== undefined &&
				nextState.flowDirection !== lastFlowDirection;
			const arcDirectionChanged =
				lastArcDirection !== undefined &&
				nextState.arcDirection !== lastArcDirection;
			const layoutRevisionChanged =
				lastLayoutRevision !== undefined &&
				nextState.layoutRevision !== lastLayoutRevision;
			const styleRulesChanged =
				nextState.nodeStyleRules !== lastNodeStyleRules ||
				nextState.linkStyleRules !== lastLinkStyleRules;
			const displaySettingsChanged =
				nextState.fadeDistance !== workspaceState.fadeDistance;
			const shouldRebuild =
				nextState.activeChartId !== lastActiveChartId ||
				nextState.projection !== lastProjection ||
				nextState.mode !== lastMode ||
				nextState.flowEdgeStyle !== lastFlowEdgeStyle ||
				nextState.flowDirection !== lastFlowDirection ||
				nextState.arcDirection !== lastArcDirection ||
				nextState.layoutRevision !== lastLayoutRevision ||
				styleRulesChanged;
			workspaceState = nextState;
			scheduleAutoSave(nextState);
			if (displaySettingsChanged) {
				renderer?.setFadeDistance(nextState.fadeDistance);
			}
			if (shouldRebuild) {
				lastProjection = nextState.projection;
				lastActiveChartId = nextState.activeChartId;
				lastMode = nextState.mode;
				lastFlowEdgeStyle = nextState.flowEdgeStyle;
				lastFlowDirection = nextState.flowDirection;
				lastArcDirection = nextState.arcDirection;
				lastLayoutRevision = nextState.layoutRevision;
				lastNodeStyleRules = nextState.nodeStyleRules;
				lastLinkStyleRules = nextState.linkStyleRules;
				void rebuildGraph(
					activeChartChanged ||
					modeChanged ||
						flowStyleChanged ||
						flowDirectionChanged ||
						arcDirectionChanged ||
						layoutRevisionChanged,
					flowStyleChanged ||
						flowDirectionChanged ||
						arcDirectionChanged ||
						layoutRevisionChanged,
				).catch(
					(error: unknown) => {
					controller.setRendererDebugState({
						status: 'error',
						error: formatError(error),
					});
					},
				);
			} else {
				renderer?.setSelected(nextState.selectedNodeId);
				renderer?.setHovered(nextState.hoveredNodeId);
			}
		});

		return () => {
			renderVersion += 1;
			window.clearTimeout(autoSaveTimer);
			if (pendingAutoSave) {
				void onAutoSave(pendingAutoSave);
				pendingAutoSave = undefined;
			}
			unsubscribe();
			resizeObserver.disconnect();
			workspaceRoot.removeEventListener('keydown', handleWorkspaceKeydown);
			workspaceRoot.removeEventListener(
				'pointerdown',
				focusWorkspaceForShortcuts,
			);
			window.removeEventListener('mousemove', handleGraphConnectionMouseMove, {
				capture: true,
			});
			window.removeEventListener('mouseup', handleGraphConnectionMouseUp, {
				capture: true,
			});
			unbindEvents?.();
			renderer?.kill();
		};
	});

	function scheduleAutoSave(state: WorkspaceState): void {
		const document = serializeMetaGraphState(state);
		const serialized = JSON.stringify(document);
		const fingerprint = serialized;
		if (fingerprint === lastAutoSavedState) {
			return;
		}
		lastAutoSavedState = fingerprint;
		pendingAutoSave = document;
		window.clearTimeout(autoSaveTimer);
		autoSaveTimer = window.setTimeout(() => {
			const documentToSave = pendingAutoSave;
			pendingAutoSave = undefined;
			if (documentToSave) {
				void onAutoSave(documentToSave);
			}
		}, 350);
	}

	async function rebuildGraph(
		fitAfterRender = false,
		forceLayout = false,
	): Promise<void> {
		const version = ++renderVersion;

		if (
			!workspaceState.projection ||
			workspaceState.projection.nodes.length === 0 ||
			!canvas
		) {
			unbindEvents?.();
			unbindEvents = undefined;
			renderer?.kill();
			renderer = undefined;
			controller.setRendererDebugState({ status: 'idle' });
			return;
		}

		controller.setRendererDebugState({
			status: 'waiting-for-size',
			mode: workspaceState.mode,
			container: readContainerSize(),
		});
		const hasSize = await waitForCanvasSize();
		if (!hasSize || version !== renderVersion) {
			if (!hasSize) {
				throw new Error(
					'The Sigma container has zero width or height after waiting for layout.',
				);
			}
			return;
		}

		const palette = readGraphPalette(canvas);
		const layoutSnapshot = getLayoutSnapshot();
		const positions = layoutSnapshot.positions;
		const graph = new GraphologyAdapter(
			palette,
			workspaceState.nodeStyleRules,
			getActiveLinkStyleRules(),
		).fromProjection(workspaceState.projection, positions);
		const newNodeIds = graph
			.nodes()
			.filter((nodeId) => !positions.has(nodeId));
		controller.setRendererDebugState({
			status: 'layout',
			mode: workspaceState.mode,
			container: readContainerSize(),
			runtimeGraph: serializeRuntimeGraph(graph),
		});
		await applyStableLayout(
			graph,
			layoutSnapshot,
			newNodeIds,
			forceLayout,
		);
		if (version !== renderVersion) {
			return;
		}

		const firstRender = !renderer;
		if (renderer) {
			renderer.setGraph(graph);
		} else {
			const nextRenderer = new SigmaRenderer(
				graph,
				canvas,
				palette,
				workspaceState.fadeDistance,
			);
			renderer = nextRenderer;
			unbindEvents = bindGraphEvents(nextRenderer, {
				onSelect: (nodeId) => controller.selectNode(nodeId),
				onHover: (nodeId) => controller.hoverNode(nodeId),
				onOpen: (nodeId) => void controller.openNode(nodeId),
				onConnectionDrag: (state) => {
					connectionDrag = state;
					if (!state) {
						graphConnectionTargetNotePath = undefined;
						graphConnectionTargetTemplateId = undefined;
					}
				},
				onConnect: (sourceNodeId, targetNodeId) => {
					void controller
						.connectNodes(
							sourceNodeId,
							targetNodeId,
							workspaceState.activeConnectionField,
						)
						.catch((error: unknown) =>
							controller.setRendererDebugState({
								status: 'error',
								error: formatError(error),
							}),
						);
				},
			});
		}
		renderer.setSelected(workspaceState.selectedNodeId);
		renderer.setHovered(workspaceState.hoveredNodeId);
		if (firstRender || fitAfterRender) {
			renderer.fit();
		}
		controller.setRendererDebugState({
			status: 'rendered',
			mode: workspaceState.mode,
			container: readContainerSize(),
			runtimeGraph: serializeRuntimeGraph(graph),
		});
	}

	const selectedNode = $derived(
		workspaceState.projection?.nodes.find(
			(node) => node.id === workspaceState.selectedNodeId,
		),
	);
	const searchableNodes = $derived(workspaceState.projection?.nodes ?? []);
	const debugSnapshot: DebugSnapshot = $derived(
		controller.getDebugSnapshot(workspaceState),
	);
	const selectedDockNodes = $derived(getSelectedDockNodes(debugSnapshot));
	const dockNoteCandidates = $derived(getDockNoteCandidates(debugSnapshot));

	function toggleDebug(): void {
		debugOpen = !debugOpen;
		if (!debugOpen) {
			window.requestAnimationFrame(() => renderer?.resize());
		}
	}

	function toggleGraphSettings(): void {
		graphSettingsOpen = !graphSettingsOpen;
		window.requestAnimationFrame(() => renderer?.resize());
	}

	async function waitForCanvasSize(): Promise<boolean> {
		for (let attempt = 0; attempt < 20; attempt += 1) {
			const { width, height } = canvas.getBoundingClientRect();
			if (width > 0 && height > 0) {
				return true;
			}
			await nextAnimationFrame();
		}
		return false;
	}

	function nextAnimationFrame(): Promise<void> {
		return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
	}

	function readContainerSize(): { width: number; height: number } {
		const { width, height } = canvas.getBoundingClientRect();
		return { width, height };
	}

	async function applyStableLayout(
		graph: RuntimeGraph,
		snapshot: LayoutSnapshot,
		newNodeIds: string[],
		forceLayout: boolean,
	): Promise<void> {
		const positions = snapshot.positions;
		const firstLayout = positions.size === 0;
		const currentEdgeIds = getLogicalEdgeIds(graph);
		const flowEdgesChanged =
			workspaceState.mode === 'flow' &&
			!setsEqual(currentEdgeIds, snapshot.edgeIds);
		const needsLayout =
			forceLayout ||
			firstLayout ||
			newNodeIds.length > 0;

		if (workspaceState.mode === 'arc') {
			await new ArcLayout(
				workspaceState.arcSpacing,
				workspaceState.arcDirection,
			).apply(graph);
			snapshot.edgeIds = currentEdgeIds;
			snapshot.orthogonalRoutes = new Map();
		} else if (workspaceState.mode === 'flow') {
			if (needsLayout) {
				const layout = new ElkFlowLayout(
					workspaceState.flowEdgeStyle,
					workspaceState.flowDirection,
					workspaceState.flowSpacing,
				);
				await layout.apply(graph);
				snapshot.edgeIds = currentEdgeIds;
				snapshot.orthogonalRoutes =
					workspaceState.flowEdgeStyle === 'orthogonal'
						? layout.getOrthogonalRoutes()
						: new Map();
			} else if (workspaceState.flowEdgeStyle === 'orthogonal') {
				applyOrthogonalFlowEdges(graph, snapshot.orthogonalRoutes);
			}
			if (flowEdgesChanged) {
				snapshot.edgeIds = currentEdgeIds;
			}
		} else {
			if (needsLayout) {
				await new ForceAtlasLayout(workspaceState.graphSpacing).apply(graph);
			}
		}

		graph.forEachNode((nodeId, attributes) => {
			if (!attributes.isBend) {
				positions.set(nodeId, { x: attributes.x, y: attributes.y });
			}
			graph.setNodeAttribute(nodeId, 'fixed', false);
		});
	}

	function getLayoutSnapshot(): LayoutSnapshot {
		const key = getLayoutSnapshotKey();
		let snapshot = layoutSnapshots.get(key);
		if (!snapshot) {
			snapshot = {
				positions: new Map(),
				edgeIds: new Set(),
				orthogonalRoutes: new Map(),
			};
			layoutSnapshots.set(key, snapshot);
		}
		return snapshot;
	}

	function getLayoutSnapshotKey(): string {
		if (workspaceState.mode === 'graph') {
			return `${workspaceState.activeChartId}-graph`;
		}
		if (workspaceState.mode === 'arc') {
			return `${workspaceState.activeChartId}-arc-${workspaceState.arcDirection}`;
		}
		return `${workspaceState.activeChartId}-flow-${workspaceState.flowEdgeStyle}-${workspaceState.flowDirection}`;
	}

	function getLogicalEdgeIds(graph: RuntimeGraph): Set<string> {
		return new Set(
			graph
				.edges()
				.filter((edge) => !graph.getEdgeAttribute(edge, 'hidden')),
		);
	}

	function getActiveLinkStyleRules() {
		return workspaceState.linkStyleRules;
	}

	function setsEqual(left: Set<string>, right: Set<string>): boolean {
		return (
			left.size === right.size &&
			[...left].every((value) => right.has(value))
		);
	}

	function serializeRuntimeGraph(graph: RuntimeGraph) {
		return {
			nodeCount: graph.order,
			edgeCount: graph.size,
			nodes: graph.mapNodes((id, attributes) => ({
				id,
				x: attributes.x,
				y: attributes.y,
				label: attributes.label,
			})),
			edges: graph.mapEdges((id, attributes, source, target) => ({
				id,
				source,
				target,
				type: attributes.type,
				hidden: attributes.hidden,
			})),
		};
	}

	function formatError(error: unknown): string {
		return error instanceof Error
			? `${error.name}: ${error.message}\n${error.stack ?? ''}`
			: String(error);
	}

	function confirmDeleteActiveChart(): void {
		if (workspaceState.charts.length <= 1) {
			return;
		}
		const activeChart = workspaceState.charts.find(
			(chart) => chart.id === workspaceState.activeChartId,
		);
		if (!activeChart) {
			return;
		}
		new ConfirmDeleteViewModal(app, activeChart.name, () =>
			controller.deleteActiveChart(),
		).open();
	}

	function focusNodeFromSearch(nodeId: string): void {
		controller.selectNode(nodeId);
		window.requestAnimationFrame(() => renderer?.focusNode(nodeId));
	}

	function getSelectedDockNodes(snapshot: DebugSnapshot) {
		const nodesByPath = new Map(snapshot.index.nodes.map((node) => [node.path, node]));
		return workspaceState.dock.notes
			.map((note) => nodesByPath.get(note.path))
			.filter((node) => node !== undefined);
	}

	function getDockNoteCandidates(snapshot: DebugSnapshot) {
		const selectedPaths = new Set(
			workspaceState.dock.notes.map((note) => note.path),
		);
		return snapshot.index.nodes
			.filter(
				(node) =>
					node.path !== workspaceFilePath &&
					!selectedPaths.has(node.path),
			)
			.sort((first, second) =>
				first.title.localeCompare(second.title, undefined, {
					sensitivity: 'base',
				}),
			);
	}

	function handleDockDragStart(
		payload: DockDragPayload,
		event: DragEvent,
	): void {
		dockDrag = payload;
		if (!event.dataTransfer) {
			return;
		}
		event.dataTransfer.effectAllowed = 'link';
		event.dataTransfer.setData(DOCK_DRAG_MIME, JSON.stringify(payload));
		event.dataTransfer.setData('text/plain', payload.label);
	}

	function handleDockDragOver(event: DragEvent): void {
		const payload = getDockDragPayload(event);
		if (!payload || !renderer) {
			return;
		}
		if (isGraphOverlayTarget(event.target)) {
			setDockTarget(undefined);
			return;
		}
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'link';
		}
		setDockTarget(readNodeAtDragEvent(event, payload));
	}

	function handleDockDrop(event: DragEvent): void {
		const payload = getDockDragPayload(event);
		if (!payload) {
			resetDockDrag();
			return;
		}
		if (isGraphOverlayTarget(event.target)) {
			resetDockDrag();
			return;
		}
		event.preventDefault();
		const targetNodeId = readNodeAtDragEvent(event, payload);
		resetDockDrag();
		if (!targetNodeId) {
			return;
		}
		connectDockPayloadToGraph(payload, targetNodeId);
	}

	function handleDockDragEnd(event: DragEvent): void {
		const payload = dockDrag;
		if (!payload) {
			return;
		}
		const targetNodeId =
			dockTargetNodeId ?? readNodeAtDragEvent(event, payload);
		resetDockDrag();
		if (!targetNodeId) {
			return;
		}
		connectDockPayloadToGraph(payload, targetNodeId);
	}

	function connectDockPayloadToGraph(
		payload: DockDragPayload,
		targetNodeId: string,
	): void {
		if (payload.kind === 'template') {
			openCreateFromTemplateModal(payload, targetNodeId);
			return;
		}
		void controller
			.connectDockNote(
				payload.notePath,
				targetNodeId,
				payload.direction,
				payload.relationField,
			)
			.catch((error: unknown) =>
				controller.setRendererDebugState({
					status: 'error',
					error: formatError(error),
				}),
			);
	}

	function handleDockDragLeave(event: DragEvent): void {
		if (
			event.currentTarget instanceof Node &&
			event.relatedTarget instanceof Node &&
			event.currentTarget.contains(event.relatedTarget)
		) {
			return;
		}
		setDockTarget(undefined);
	}

	function resetDockDrag(): void {
		dockDrag = undefined;
		setDockTarget(undefined);
	}

	function getDockDragPayload(event: DragEvent): DockDragPayload | undefined {
		if (dockDrag) {
			return dockDrag;
		}
		const transfer = event.dataTransfer;
		if (!transfer || !Array.from(transfer.types).includes(DOCK_DRAG_MIME)) {
			return undefined;
		}
		return parseDockDragPayload(transfer.getData(DOCK_DRAG_MIME));
	}

	function parseDockDragPayload(value: string): DockDragPayload | undefined {
		try {
			const parsed = JSON.parse(value) as unknown;
			if (!parsed || typeof parsed !== 'object') {
				return undefined;
			}
			if (
				'kind' in parsed &&
				parsed.kind === 'template' &&
				'templateId' in parsed &&
				'label' in parsed &&
				typeof parsed.templateId === 'string' &&
				typeof parsed.label === 'string'
			) {
				return {
					kind: 'template',
					templateId: parsed.templateId,
					label: parsed.label,
				};
			}
			if (
				'kind' in parsed &&
				parsed.kind === 'note' &&
				'notePath' in parsed &&
				'label' in parsed &&
				'direction' in parsed &&
				'relationField' in parsed &&
				typeof parsed.notePath === 'string' &&
				typeof parsed.label === 'string' &&
				(parsed.direction === 'from-graph-to-dock' ||
					parsed.direction === 'from-dock-to-graph') &&
				typeof parsed.relationField === 'string'
			) {
				return {
					kind: 'note',
					notePath: parsed.notePath,
					label: parsed.label,
					direction: parsed.direction,
					relationField: parsed.relationField,
				};
			}
		} catch {
			return undefined;
		}
		return undefined;
	}

	function readNodeAtDragEvent(
		event: DragEvent,
		payload: DockDragPayload,
	): string | undefined {
		if (!canvas || !renderer) {
			return undefined;
		}
		const rect = canvas.getBoundingClientRect();
		const nodeId = renderer.getNodeAtViewportPosition({
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		});
		if (!nodeId) {
			return undefined;
		}
		return payload.kind === 'note' && payload.notePath === nodeId
			? undefined
			: nodeId;
	}

	function setDockTarget(nodeId?: string): void {
		if (dockTargetNodeId === nodeId) {
			return;
		}
		dockTargetNodeId = nodeId;
		renderer?.setHovered(nodeId ?? workspaceState.hoveredNodeId);
	}

	function handleGraphConnectionMouseMove(event: MouseEvent): void {
		if (!connectionDrag) {
			return;
		}
		const target = readElementAtMouseEvent(event);
		graphConnectionTargetNotePath = readDockNotePathFromTarget(target);
		graphConnectionTargetTemplateId = readDockTemplateIdFromTarget(target);
	}

	function handleGraphConnectionMouseUp(event: MouseEvent): void {
		if (!connectionDrag) {
			return;
		}
		const target = readElementAtMouseEvent(event);
		const templateId =
			graphConnectionTargetTemplateId ??
			readDockTemplateIdFromTarget(target);
		if (templateId) {
			const sourceNodeId = connectionDrag.sourceNodeId;
			graphConnectionTargetNotePath = undefined;
			graphConnectionTargetTemplateId = undefined;
			openCreateFromTemplateId(templateId, sourceNodeId);
			return;
		}
		const notePath =
			graphConnectionTargetNotePath ?? readDockNotePathFromTarget(target);
		if (!notePath || notePath === connectionDrag.sourceNodeId) {
			return;
		}
		const sourceNodeId = connectionDrag.sourceNodeId;
		graphConnectionTargetNotePath = undefined;
		graphConnectionTargetTemplateId = undefined;
		void controller
			.connectNodes(
				sourceNodeId,
				notePath,
				workspaceState.activeConnectionField,
			)
			.catch((error: unknown) =>
				controller.setRendererDebugState({
					status: 'error',
					error: formatError(error),
				}),
			);
	}

	function readElementAtMouseEvent(event: MouseEvent): Element | null {
		return document.elementFromPoint(event.clientX, event.clientY);
	}

	function readDockNotePathFromTarget(target: EventTarget | null): string | undefined {
		if (!(target instanceof HTMLElement)) {
			return undefined;
		}
		const noteEl = target.closest<HTMLElement>('[data-dock-note-path]');
		return noteEl?.dataset.dockNotePath || undefined;
	}

	function readDockTemplateIdFromTarget(
		target: EventTarget | null,
	): string | undefined {
		if (!(target instanceof HTMLElement)) {
			return undefined;
		}
		const templateEl = target.closest<HTMLElement>('[data-dock-template-id]');
		return templateEl?.dataset.dockTemplateId || undefined;
	}

	function openCreateFromTemplateModal(
		payload: Extract<DockDragPayload, { kind: 'template' }>,
		targetNodeId: string,
	): void {
		openCreateFromTemplateId(payload.templateId, targetNodeId, payload.label);
	}

	function openCreateFromTemplateId(
		templateId: string,
		targetNodeId: string,
		label = findTemplateLabel(templateId),
	): void {
		if (!label) {
			return;
		}
		new CreateFromTemplateModal(
			app,
			label,
			findNodeTitle(targetNodeId),
			(name) =>
				controller.createNoteFromTemplate(
					templateId,
					targetNodeId,
					name,
				),
		).open();
	}

	function findTemplateLabel(templateId: string): string | undefined {
		return workspaceState.dock.templates.find(
			(template) => template.id === templateId,
		)?.label;
	}

	function findNodeTitle(nodeId: string): string {
		return (
			debugSnapshot.index.nodes.find((node) => node.id === nodeId)?.title ??
			nodeId
		);
	}

	function isGraphOverlayTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) {
			return false;
		}
		return Boolean(
			target.closest(
				'.knowledge-workspace-dock-panel, .knowledge-workspace-display-controls, .knowledge-workspace-inspector, .knowledge-workspace-connection-panel',
			),
		);
	}

	function focusWorkspaceForShortcuts(event: PointerEvent): void {
		if (isEditableTarget(event.target)) {
			return;
		}
		workspaceRoot?.focus({ preventScroll: true });
	}

	function handleWorkspaceKeydown(event: KeyboardEvent): void {
		if (
			!(event.ctrlKey || event.metaKey) ||
			event.altKey ||
			event.shiftKey ||
			event.key.toLocaleLowerCase() !== 'z' ||
			workspaceState.connectionUndoCount === 0 ||
			isEditableTarget(event.target)
		) {
			return;
		}
		event.preventDefault();
		void controller.undoLastConnection().catch((error: unknown) =>
			controller.setRendererDebugState({
				status: 'error',
				error: formatError(error),
			}),
		);
	}

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) {
			return false;
		}
		return Boolean(
			target.closest('input, textarea, select, button, [contenteditable="true"]'),
		);
	}
</script>

<div
	class="knowledge-workspace"
	bind:this={workspaceRoot}
	tabindex="-1"
>
	<Toolbar
		mode={workspaceState.mode}
		charts={workspaceState.charts}
		activeChartId={workspaceState.activeChartId}
		flowEdgeStyle={workspaceState.flowEdgeStyle}
		flowDirection={workspaceState.flowDirection}
		arcDirection={workspaceState.arcDirection}
		searchNodes={searchableNodes}
		onSelectChart={(id) => controller.setActiveChart(id)}
		onAddChart={() => controller.addChart()}
		onRenameChart={(name) => controller.setActiveChartName(name)}
		onChartType={(mode) => controller.setActiveChartType(mode)}
		onDeleteChart={confirmDeleteActiveChart}
		onFlowEdgeStyle={(style) => controller.setFlowEdgeStyle(style)}
		onFlowDirection={(direction) =>
			controller.setFlowDirection(direction)}
		onArcDirection={(direction) => controller.setArcDirection(direction)}
		onFocusNode={focusNodeFromSearch}
		onFit={() => renderer?.fit()}
		onRefresh={() => controller.refresh(true)}
		{graphSettingsOpen}
		onToggleGraphSettings={toggleGraphSettings}
		{showDebugButton}
		{debugOpen}
		onToggleDebug={toggleDebug}
	/>
	<div
		class="knowledge-workspace-body"
		class:knowledge-workspace-body-no-graph-settings={!graphSettingsOpen}
		class:knowledge-workspace-hidden={debugOpen}
	>
		{#if graphSettingsOpen}
			<FilterPanel
				query={workspaceState.query}
				folders={workspaceState.availableFolders}
				tags={workspaceState.availableTags}
				nodeStyleRules={workspaceState.nodeStyleRules}
				linkStyleRules={getActiveLinkStyleRules()}
				onChange={(patch) => controller.updateQuery(patch)}
				onNodeStyleRulesChange={(rules) =>
					controller.setNodeStyleRules(rules)}
				onLinkStyleRulesChange={(rules) =>
					controller.setLinkStyleRules(rules)}
			/>
		{/if}
		<main
			class="knowledge-workspace-main"
			class:dock-node-dragging={Boolean(dockDrag)}
			ondragover={handleDockDragOver}
			ondrop={handleDockDrop}
			ondragleave={handleDockDragLeave}
		>
			<div class="knowledge-workspace-canvas" bind:this={canvas}></div>
			{#if connectionDrag}
				<svg
					class="knowledge-workspace-connection-preview"
					aria-hidden="true"
				>
					<line
						class:target={Boolean(connectionDrag.targetNodeId)}
						x1={connectionDrag.x1}
						y1={connectionDrag.y1}
						x2={connectionDrag.x2}
						y2={connectionDrag.y2}
					/>
				</svg>
			{/if}
			<DisplayControls
				fadeDistance={workspaceState.fadeDistance}
				onInput={(value) => controller.setFadeDistance(value)}
				onCommit={(value) => controller.setFadeDistance(value)}
			/>
			{#if workspaceState.projection?.nodes.length === 0}
				<div class="knowledge-workspace-empty">No matching metadata relationships.</div>
			{/if}
			<DockGraphPanel
				templates={workspaceState.dock.templates}
				selectedNotes={selectedDockNodes}
				availableNotes={dockNoteCandidates}
				activeConnectionField={workspaceState.activeConnectionField}
				draggingKey={dockDrag
					? dockDrag.kind === 'template'
						? `template:${dockDrag.templateId}`
						: `note:${dockDrag.notePath}`
					: undefined}
				targetNodeId={dockTargetNodeId}
				graphTargetNotePath={graphConnectionTargetNotePath}
				graphTargetTemplateId={graphConnectionTargetTemplateId}
				onAddTemplate={(template) => controller.addDockTemplate(template)}
				onRemoveTemplate={(templateId) =>
					controller.removeDockTemplate(templateId)}
				onAddNote={(path) => controller.addDockNote(path)}
				onRemoveNote={(path) => controller.removeDockNote(path)}
				onDragStart={handleDockDragStart}
				onDragEnd={handleDockDragEnd}
				onOpenNote={(nodeId) => void controller.openNode(nodeId)}
			/>
			<Inspector node={selectedNode} />
			<ConnectionPanel
				fields={workspaceState.connectionFields}
				activeField={workspaceState.activeConnectionField}
				dragging={Boolean(connectionDrag)}
				dragTarget={connectionDrag?.targetNodeId}
				undoCount={workspaceState.connectionUndoCount}
				onSelectField={(field) => controller.setActiveConnectionField(field)}
				onAddField={(field) => controller.addConnectionField(field)}
				onUndo={() =>
					void controller.undoLastConnection().catch((error: unknown) =>
						controller.setRendererDebugState({
							status: 'error',
							error: formatError(error),
						}),
					)}
			/>
		</main>
	</div>
	{#if debugOpen}
		<DebugPanel
			snapshot={debugSnapshot}
			onRefresh={() => controller.refresh(true)}
		/>
	{/if}
</div>
