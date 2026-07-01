<script lang="ts">
	import type { App } from 'obsidian';
	import { onMount } from 'svelte';
	import type {
		DebugSnapshot,
		DockConnectionDirection,
		MetaGraphDocument,
		SettingsPanelMode,
		WorkspaceState,
	} from '../core/types';
	import { formatError as formatErrorMessage } from '../core/errors';
	import type { ConnectionDragState } from '../graph/renderers/renderer-events';
	import { readGraphPalette } from '../graph/styles/graph-styles';
	import {
		refreshRendererGraphStyles,
		type GraphRenderer,
	} from '../graph/renderers/renderer-adapter';
	import {
		LayoutSnapshotStore,
		type LayoutSnapshot,
	} from '../layouts/stable-layout';
	import type { WorkspaceController } from '../workspace/workspace-controller';
	import DebugPanel from './DebugPanel.svelte';
	import type { DockDragPayload } from './dock/types';
	import type { DockPayloadGraphAction } from './dock/connection';
	import {
		getMetadataFieldSuggestions,
		getMetadataFieldTypes,
		getMetadataFieldValueSuggestions,
	} from './filter-config';
	import {
		type GraphConnectionDropTarget,
		type GraphConnectionDropAction,
	} from './interactions/graph-connection-drop';
	import { shouldHandleConnectionUndoShortcut } from './interactions/keyboard-shortcuts';
	import {
		getDockNoteCandidates,
		getDockNoteEntries,
		getFilePathSuggestions,
		getSelectedDockNodes,
		getWorkspaceNodeColor,
		getWorkspaceNodeColors,
	} from './workspace/derived';
	import { syncRendererDisplaySettings } from './workspace/renderer-display-sync';
	import { shouldCloseSettingsPanelForChartSource } from './workspace/settings-panel';
	import {
		readInteractiveAccentColor,
		readThemeSignature,
	} from './workspace/theme';
	import { openResolvedMetadataLink } from './workspace/metadata-link-actions';
	import { openWorkspaceCreateTemplateNote } from './workspace/workspace-template-flow';
	import { WorkspaceAutoSave } from './workspace/autosave';
	import {
		analyzeWorkspaceStateChanges,
		createWorkspaceRenderBaseline,
		syncWorkspaceRenderBaselineStyles,
		type WorkspaceRenderBaseline,
	} from './workspace/change-tracker';
	import { syncWorkspaceRuntimeGraphStyles } from './workspace/runtime-graph';
	import { bindWorkspaceRendererEvents } from './workspace/renderer-events';
	import {
		moveWorkspaceRuntimeGroupNodes,
		syncWorkspaceRendererGroups,
	} from './workspace/renderer-groups';
	import { WorkspaceRendererLifecycle } from './workspace/renderer-lifecycle';
	import { DockGraphDragController } from './workspace/dock-graph-drag';
	import { GraphDockConnectionController } from './workspace/graph-dock-connection';
	import WorkspaceSettingsPopover from './workspace/WorkspaceSettingsPopover.svelte';
	import WorkspaceMainPanels from './workspace/WorkspaceMainPanels.svelte';
	import {
		createCuratedConditionDraft,
		type CuratedConditionDraft,
	} from './curated/curated-panel-state';

	import { ConfirmDeleteViewModal } from './ConfirmDeleteWorkspaceModal';
	import Toolbar from './Toolbar.svelte';

	let {
		app,
		controller,
		onAutoSave,
		workspaceFilePath,
		showDebugButton,
		openTemplateNoteInNewTab,
	}: {
		app: App;
		controller: WorkspaceController;
		onAutoSave: (document: MetaGraphDocument) => Promise<void>;
		workspaceFilePath?: string;
		showDebugButton: boolean;
		openTemplateNoteInNewTab: boolean;
	} = $props();
	let workspaceState: WorkspaceState = $state(getInitialState());
	let workspaceRoot: HTMLDivElement;
	let canvas: HTMLDivElement;
	let lastThemeSignature = '';
	let lastCanvasWidth = 0;
	let lastCanvasHeight = 0;
	let renderBaseline: WorkspaceRenderBaseline = {};
	let debugOpen = $state(false);
	let settingsPanel = $state<SettingsPanelMode | undefined>(undefined);
	let settingsPopoverLeft = $state(0);
	let connectionDrag = $state<ConnectionDragState | undefined>(undefined);
	let graphConnectionTargetNotePath = $state<string | undefined>(undefined);
	let graphConnectionTargetTemplateId = $state<string | undefined>(undefined);
	let graphConnectionTargetCurated = $state(false);
	let curatedSelection = $state<Set<string>>(new Set());
	let curatedConditionDrafts = $state<Record<string, CuratedConditionDraft>>(
		{},
	);
	let dockDrag = $state<DockDragPayload | undefined>(undefined);
	let dockConnectionDrag = $state<DockDragPayload | undefined>(undefined);
	let dockTargetNodeId = $state<string | undefined>(undefined);
	let dockOpen = $state(true);
	let curatedPanelOpen = $state(true);
	let connectionOpen = $state(true);
	let suppressNodeOpenUntil = 0;
	let activeNodeDropGroupId: string | undefined;

	const layoutSnapshots = new LayoutSnapshotStore();
	const rendererLifecycle = new WorkspaceRendererLifecycle({
		readState: () => workspaceState,
		readCanvas: () => canvas,
		readLayoutSnapshot: () => getLayoutSnapshot(),
		readContainerSize: () => readContainerSize(),
		waitForCanvasSize: () => waitForCanvasSize(),
		bindEvents: (targetRenderer) => bindEventsForRenderer(targetRenderer),
		syncRendererGroups: () => syncRendererGroups(),
		setRendererDebugState: (state) =>
			controller.setRendererDebugState(state),
	});
	const dockGraphDrag = new DockGraphDragController({
		window,
		readCanvas: () => canvas,
		readRenderer: () => rendererLifecycle.renderer,
		readHoveredNodeId: () => workspaceState.hoveredNodeId,
		setDockDrag: (payload) => {
			dockDrag = payload;
		},
		setDockConnectionDrag: (payload) => {
			dockConnectionDrag = payload;
		},
		setConnectionDrag: (state) => {
			connectionDrag = state;
		},
		setDockTarget: (nodeId) => {
			dockTargetNodeId = nodeId;
		},
		onDrop: (action) => handleDockPayloadGraphAction(action),
	});
	const graphDockConnection = new GraphDockConnectionController({
		readConnectionDrag: () => connectionDrag,
		readDockConnectionDrag: () => dockConnectionDrag,
		readDocument: () => readWorkspaceDocument(),
		setTarget: (target: GraphConnectionDropTarget) => {
			graphConnectionTargetNotePath = target.notePath;
			graphConnectionTargetTemplateId = target.templateId;
			graphConnectionTargetCurated = target.curated;
		},
		onDrop: (action) => handleGraphConnectionDropAction(action),
	});

	function handleGraphConnectionDropAction(
		action: GraphConnectionDropAction,
	): void {
		if (action.kind === 'add-curated') {
			controller.addCuratedFile(action.sourceNodeId);
			return;
		}
		if (action.kind === 'create-from-template') {
			openCreateFromTemplateId(
				action.templateId,
				action.sourceNodeId,
				undefined,
				'from-graph-to-dock',
			);
			return;
		}
		if (action.kind === 'connect-note') {
			void controller
				.connectNodes(
					action.sourceNodeId,
					action.notePath,
					workspaceState.activeConnectionField,
				)
				.then(() => {
					controller.addCuratedFile(action.notePath);
				})
				.catch((error: unknown) =>
					controller.setRendererDebugState({
						status: 'error',
						error: formatError(error),
					}),
				);
		}
	}

	function connectVisibleNodes(
		sourceNodeId: string,
		targetNodeId: string,
	): void {
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
	}

	function setGraphConnectionDrag(
		state: ConnectionDragState | undefined,
	): void {
		connectionDrag = state;
		if (!state) {
			graphDockConnection.resetTarget();
		}
	}

	function getInitialState(): WorkspaceState {
		return controller.snapshot;
	}

	onMount(() => {
		const autoSave = new WorkspaceAutoSave(onAutoSave, 350, window);
		autoSave.initialize(controller.snapshot);
		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (
				entry &&
				entry.contentRect.width > 0 &&
				entry.contentRect.height > 0 &&
				(entry.contentRect.width !== lastCanvasWidth ||
					entry.contentRect.height !== lastCanvasHeight)
			) {
				lastCanvasWidth = entry.contentRect.width;
				lastCanvasHeight = entry.contentRect.height;
				rendererLifecycle.resize();
			}
		});
		resizeObserver.observe(canvas);
		lastThemeSignature = readThemeSignature(readWorkspaceDocument());
		const themeObserver = new MutationObserver(() => {
			refreshRendererTheme();
		});
		themeObserver.observe(readWorkspaceDocument().body, {
			attributes: true,
			attributeFilter: ['class'],
		});
		themeObserver.observe(readWorkspaceDocument().documentElement, {
			attributes: true,
			attributeFilter: ['class'],
		});
		workspaceRoot.addEventListener('keydown', handleWorkspaceKeydown);
		workspaceRoot.addEventListener(
			'pointerdown',
			focusWorkspaceForShortcuts,
		);
		window.addEventListener(
			'mousemove',
			graphDockConnection.handleMouseMove,
			{
				capture: true,
			},
		);
		window.addEventListener('mouseup', graphDockConnection.handleMouseUp, {
			capture: true,
		});
		window.addEventListener(
			'pointermove',
			graphDockConnection.handlePointerMove,
			{
				capture: true,
			},
		);
		window.addEventListener(
			'pointerup',
			graphDockConnection.handlePointerUp,
			{
				capture: true,
			},
		);

		const unsubscribe = controller.subscribe((nextState) => {
			const changes = analyzeWorkspaceStateChanges(
				nextState,
				workspaceState,
				renderBaseline,
			);
			workspaceState = nextState;
			if (changes.manualLayoutChanged) {
				renderBaseline.manualLayout = nextState.manualLayout;
				syncRendererGroups();
			}
			if (
				shouldCloseSettingsPanelForChartSource(
					settingsPanel,
					nextState.chartSource,
				)
			) {
				settingsPanel = undefined;
			}
			autoSave.schedule(nextState);
			const currentRenderer = rendererLifecycle.renderer;
			syncRendererDisplaySettings(currentRenderer, nextState, changes);
			if (
				(changes.styleRulesChanged ||
					changes.manualLayoutChanged ||
					changes.graphVisibilityChanged) &&
				!changes.shouldRebuild &&
				currentRenderer &&
				nextState.projection &&
				canvas
			) {
				syncWorkspaceRuntimeGraphStyles(
					currentRenderer.runtimeGraph,
					nextState.projection,
					nextState,
					readGraphPalette(canvas),
				);
				refreshRendererGraphStyles(currentRenderer);
				syncWorkspaceRenderBaselineStyles(renderBaseline, nextState);
			}
			if (changes.forceLayoutChanged) {
				rendererLifecycle.handleForceLayoutToggle(
					nextState.enableForceLayout,
				);
			}
			if (changes.graphForceSettingsChanged) {
				rendererLifecycle.restartSigmaForceLayoutIfNeeded();
			}
			if (changes.shouldRebuild) {
				renderBaseline = createWorkspaceRenderBaseline(nextState);
				void rendererLifecycle
					.rebuild(changes.fitAfterRender, changes.forceLayout)
					.catch((error: unknown) => {
						controller.setRendererDebugState({
							status: 'error',
							error: formatError(error),
						});
					});
			} else {
				rendererLifecycle.setSelected(nextState.selectedNodeId);
				rendererLifecycle.setHovered(nextState.hoveredNodeId);
			}
		});

		return () => {
			autoSave.flush();
			unsubscribe();
			resizeObserver.disconnect();
			themeObserver.disconnect();
			workspaceRoot.removeEventListener(
				'keydown',
				handleWorkspaceKeydown,
			);
			workspaceRoot.removeEventListener(
				'pointerdown',
				focusWorkspaceForShortcuts,
			);
			window.removeEventListener(
				'mousemove',
				graphDockConnection.handleMouseMove,
				{
					capture: true,
				},
			);
			window.removeEventListener(
				'mouseup',
				graphDockConnection.handleMouseUp,
				{
					capture: true,
				},
			);
			window.removeEventListener(
				'pointermove',
				graphDockConnection.handlePointerMove,
				{
					capture: true,
				},
			);
			window.removeEventListener(
				'pointerup',
				graphDockConnection.handlePointerUp,
				{
					capture: true,
				},
			);
			dockGraphDrag.resetConnectionDrag();
			rendererLifecycle.dispose();
		};
	});

	function refreshRendererTheme(): void {
		const themeSignature = readThemeSignature(readWorkspaceDocument());
		if (themeSignature === lastThemeSignature) {
			return;
		}
		lastThemeSignature = themeSignature;
		rendererLifecycle.refreshPalette();
	}

	function bindEventsForRenderer(targetRenderer: GraphRenderer): () => void {
		return bindWorkspaceRendererEvents({
			renderer: targetRenderer,
			mode: workspaceState.mode,
			enableForceLayout: workspaceState.enableForceLayout,
			getLayoutSnapshot,
			getOrCreateForceLayoutSimulation: (renderer) =>
				rendererLifecycle.getOrCreateForceLayoutSimulation(renderer),
			getForceLayoutSimulation: () =>
				rendererLifecycle.getForceLayoutSimulation(),
			getSuppressNodeOpenUntil: () => suppressNodeOpenUntil,
			setSuppressNodeOpenUntil: (value) => {
				suppressNodeOpenUntil = value;
			},
			getActiveNodeDropGroupId: () => activeNodeDropGroupId,
			setActiveNodeDropGroupId: (groupId) => {
				activeNodeDropGroupId = groupId;
			},
			onSelect: (nodeId?: string) => controller.selectNode(nodeId),
			onHover: (nodeId?: string) => controller.hoverNode(nodeId),
			onOpen: (nodeId: string) => void controller.openNode(nodeId),
			onConnectionDrag: setGraphConnectionDrag,
			onConnect: connectVisibleNodes,
			onCommitManualNodePosition: (nodeId, position, groupId) => {
				controller.setManualNodePosition(nodeId, position, groupId);
			},
		});
	}

	function syncRendererGroups(): void {
		syncWorkspaceRendererGroups(
			rendererLifecycle.renderer,
			workspaceState.mode,
			workspaceState.manualLayout,
			{
				onMovePreview: moveRuntimeGroupNodes,
				onMoveCommit: (groupId, delta) =>
					controller.moveGroup(groupId, delta),
				onResizeCommit: (groupId, geometry) =>
					controller.resizeGroup(groupId, geometry),
			},
		);
	}

	function moveRuntimeGroupNodes(
		groupId: string,
		delta: { x: number; y: number },
	): void {
		moveWorkspaceRuntimeGroupNodes(
			rendererLifecycle.renderer,
			getLayoutSnapshot(),
			workspaceState.manualLayout,
			groupId,
			delta,
		);
	}

	const selectedNode = $derived(
		workspaceState.projection?.nodes.find(
			(node) => node.id === workspaceState.selectedNodeId,
		),
	);
	const selectedNodeColor = $derived.by(() => {
		if (!selectedNode) {
			return undefined;
		}
		const defaultColor = readInteractiveAccentColor(
			readWorkspaceDocument(),
		);
		return getWorkspaceNodeColor(
			selectedNode,
			workspaceState,
			defaultColor,
		);
	});
	const searchableNodes = $derived(workspaceState.projection?.nodes ?? []);
	const atNodeLimit = $derived(
		workspaceState.chartSource === 'query' && workspaceState.projection
			? workspaceState.projection.nodes.length >=
					workspaceState.query.maxNodes
			: false,
	);
	const debugSnapshot: DebugSnapshot = $derived(
		controller.getDebugSnapshot(workspaceState),
	);
	const selectedDockNodes = $derived(
		getSelectedDockNodes(debugSnapshot, workspaceState.dock.notes),
	);
	const dockNoteCandidates = $derived(
		getDockNoteCandidates(
			debugSnapshot,
			workspaceState.dock.notes,
			workspaceFilePath,
		),
	);
	const nodeColors = $derived.by(() => {
		const defaultColor = readInteractiveAccentColor(
			readWorkspaceDocument(),
		);
		return getWorkspaceNodeColors(
			[...selectedDockNodes, ...dockNoteCandidates],
			workspaceState,
			defaultColor,
		);
	});
	const dockNoteEntries = $derived(
		getDockNoteEntries(
			debugSnapshot,
			workspaceState.dock.notes,
			nodeColors,
		),
	);
	const metadataFieldSuggestions = $derived(
		getMetadataFieldSuggestions(debugSnapshot.index.nodes),
	);
	const metadataFieldTypes = $derived(
		getMetadataFieldTypes(debugSnapshot.index.nodes),
	);
	const metadataFieldValueSuggestions = $derived(
		getMetadataFieldValueSuggestions(
			debugSnapshot.index.nodes,
			metadataFieldTypes,
		),
	);
	const filePathSuggestions = $derived(getFilePathSuggestions(debugSnapshot));
	const curatedConditionDraft = $derived.by(
		() =>
			curatedConditionDrafts[workspaceState.activeChartId] ??
			createCuratedConditionDraft(),
	);

	function toggleDebug(): void {
		debugOpen = !debugOpen;
		if (!debugOpen) {
			window.requestAnimationFrame(() => rendererLifecycle.resize());
		}
	}

	function openSettingsPanel(
		panel: SettingsPanelMode,
		event: MouseEvent,
	): void {
		const target = event.currentTarget;
		if (target instanceof HTMLElement && workspaceRoot) {
			const targetRect = target.getBoundingClientRect();
			const rootRect = workspaceRoot.getBoundingClientRect();
			settingsPopoverLeft = targetRect.left - rootRect.left;
		}
		settingsPanel = settingsPanel === panel ? undefined : panel;
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
		return new Promise((resolve) =>
			window.requestAnimationFrame(() => resolve()),
		);
	}

	function readContainerSize(): { width: number; height: number } {
		const { width, height } = canvas.getBoundingClientRect();
		return { width, height };
	}

	function getLayoutSnapshot(): LayoutSnapshot {
		return layoutSnapshots.get({
			activeChartId: workspaceState.activeChartId,
			mode: workspaceState.mode,
			arcDirection: workspaceState.arcDirection,
			flowEdgeStyle: workspaceState.flowEdgeStyle,
			flowDirection: workspaceState.flowDirection,
		});
	}

	function formatError(error: unknown): string {
		return formatErrorMessage(error, { includeStack: true });
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
		window.requestAnimationFrame(() => rendererLifecycle.focusNode(nodeId));
	}

	function updateCuratedConditionDraft(draft: CuratedConditionDraft): void {
		curatedConditionDrafts = {
			...curatedConditionDrafts,
			[workspaceState.activeChartId]: draft,
		};
	}

	function handleDockPayloadGraphAction(
		action: DockPayloadGraphAction,
	): void {
		if (action.kind === 'create-from-template') {
			void openCreateFromTemplateId(
				action.payload.templateId,
				action.targetNodeId,
				action.payload.label,
				action.direction,
			);
			return;
		}
		if (action.kind === 'none') {
			return;
		}
		void controller
			.connectDockNote(
				action.notePath,
				action.targetNodeId,
				action.direction,
				action.relationField,
			)
			.then(() => {
				controller.addCuratedFile(action.notePath);
			})
			.catch((error: unknown) =>
				controller.setRendererDebugState({
					status: 'error',
					error: formatError(error),
				}),
			);
	}

	async function openCreateFromTemplateId(
		templateId: string,
		targetNodeId: string,
		label?: string,
		direction: DockConnectionDirection = 'from-dock-to-graph',
	): Promise<void> {
		await openWorkspaceCreateTemplateNote({
			app,
			controller,
			workspaceState,
			debugSnapshot,
			openTemplateNoteInNewTab,
			templateId,
			targetNodeId,
			label,
			direction,
		});
	}

	function readWorkspaceDocument(): Document {
		return canvas?.ownerDocument ?? document;
	}

	async function openMetadataLink(
		linkText: string,
		sourcePath: string,
	): Promise<void> {
		await openResolvedMetadataLink(linkText, sourcePath, {
			resolveLink: (resolvedLinkText, resolvedSourcePath) =>
				app.metadataCache.getFirstLinkpathDest(
					resolvedLinkText,
					resolvedSourcePath,
				),
			openFile: (file) => app.workspace.getLeaf('tab').openFile(file),
		});
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
			!shouldHandleConnectionUndoShortcut({
				key: event.key,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				altKey: event.altKey,
				shiftKey: event.shiftKey,
				connectionUndoCount: workspaceState.connectionUndoCount,
				editableTarget: isEditableTarget(event.target),
			})
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
			target.closest(
				'input, textarea, select, button, [contenteditable="true"]',
			),
		);
	}
</script>

<div class="knowledge-workspace" bind:this={workspaceRoot} tabindex="-1">
	<Toolbar
		{app}
		mode={workspaceState.mode}
		chartSource={workspaceState.chartSource}
		charts={workspaceState.charts}
		activeChartId={workspaceState.activeChartId}
		searchNodes={searchableNodes}
		onSelectChart={(id) => controller.setActiveChart(id)}
		onAddChart={() => controller.addChart()}
		onRenameChart={(name) => controller.setActiveChartName(name)}
		onChartType={(mode) => controller.setActiveChartType(mode)}
		onChartSource={(source) => controller.setActiveChartSource(source)}
		onDeleteChart={confirmDeleteActiveChart}
		onFocusNode={focusNodeFromSearch}
		onFit={() => rendererLifecycle.fit()}
		onRefresh={() => controller.refresh(true)}
		{settingsPanel}
		onSettingsPanel={openSettingsPanel}
		{showDebugButton}
		{debugOpen}
		onToggleDebug={toggleDebug}
	/>
	<div
		class="knowledge-workspace-body"
		class:knowledge-workspace-hidden={debugOpen}
	>
		{#if settingsPanel}
			<WorkspaceSettingsPopover
				{app}
				{controller}
				{workspaceState}
				{settingsPanel}
				{settingsPopoverLeft}
				{metadataFieldSuggestions}
				{metadataFieldTypes}
				{metadataFieldValueSuggestions}
				{filePathSuggestions}
				onClose={() => {
					settingsPanel = undefined;
				}}
			/>
		{/if}
		<main
			class="knowledge-workspace-main"
			class:dock-node-dragging={Boolean(dockDrag)}
			class:connection-collapsed={!connectionOpen}
			class:curated-panel-visible={workspaceState.chartSource ===
				'curated'}
			style="--dock-panel-width: {dockOpen
				? `${workspaceState.dock.dockWidth}px`
				: '32px'}; --curated-panel-width: {workspaceState.chartSource ===
				'curated' && curatedPanelOpen
				? `${workspaceState.dock.curatedPanelWidth}px`
				: workspaceState.chartSource === 'curated'
					? '32px'
					: '0px'}"
		>
			<div class="knowledge-workspace-canvas" bind:this={canvas}></div>
			<WorkspaceMainPanels
				{app}
				{controller}
				{workspaceState}
				{debugSnapshot}
				{workspaceFilePath}
				{nodeColors}
				{dockNoteEntries}
				{dockNoteCandidates}
				{selectedNode}
				{selectedNodeColor}
				{searchableNodes}
				{atNodeLimit}
				{metadataFieldSuggestions}
				{connectionDrag}
				{graphConnectionTargetNotePath}
				{graphConnectionTargetTemplateId}
				{graphConnectionTargetCurated}
				{curatedSelection}
				{curatedConditionDraft}
				{dockDrag}
				{dockConnectionDrag}
				{dockTargetNodeId}
				{dockOpen}
				{curatedPanelOpen}
				{connectionOpen}
				onToggleDock={() => (dockOpen = !dockOpen)}
				onToggleCuratedPanel={() =>
					(curatedPanelOpen = !curatedPanelOpen)}
				onToggleConnection={() => (connectionOpen = !connectionOpen)}
				onLinkPointerDown={dockGraphDrag.handlePointerDown}
				onFocusNode={(nodeId) => rendererLifecycle.focusNode(nodeId)}
				onOpenMetadataLink={(linkText, sourcePath) =>
					void openMetadataLink(linkText, sourcePath)}
				onCuratedSelectionChange={(paths) => {
					curatedSelection = paths;
				}}
				onCuratedConditionDraftChange={updateCuratedConditionDraft}
				{formatError}
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
