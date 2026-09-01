<script lang="ts">
	import type { App } from 'obsidian';
	import { onMount } from 'svelte';
	import type {
		ChartSource,
		DebugSnapshot,
		DockConnectionDirection,
		NodeOpenMode,
		SettingsPanelMode,
		ViewMode,
		WorkspaceState,
	} from '../core/types';
	import type {
		PersistedMetaGraphDocumentV2,
		WorkspaceRightPanelTab,
		WorkspaceSessionState,
	} from '../workspace/meta-graph-v2/types';
	import { createWorkspaceSessionState } from '../workspace/workspace-session';
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
	import {
		shouldHandleConnectionUndoShortcut,
		shouldHandleFindNoteShortcut,
	} from './interactions/keyboard-shortcuts';
	import {
		getDockNoteEntries,
		getFilePathSuggestions,
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
	import {
		openWorkspaceCreateStandaloneTemplateNote,
		openWorkspaceCreateTemplateNote,
	} from './workspace/workspace-template-flow';
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
	import {
		createWorkspaceGroupByNode,
		WorkspaceRendererLifecycle,
	} from './workspace/renderer-lifecycle';
	import {
		DockCuratedDropController,
		type DockCuratedDropAction,
		type DockCuratedDropPreview,
	} from './workspace/dock-curated-drop';
	import { DockGraphDragController } from './workspace/dock-graph-drag';
	import { GraphDockConnectionController } from './workspace/graph-dock-connection';
	import WorkspaceSettingsPopover from './workspace/WorkspaceSettingsPopover.svelte';
	import WorkspaceMainPanels from './workspace/WorkspaceMainPanels.svelte';
	import GraphLoadingOverlay from './workspace/GraphLoadingOverlay.svelte';
	import {
		GraphLoadingCoordinator,
		waitForGraphLoadingPaint,
	} from './workspace/graph-loading';
	import {
		createCuratedConditionDraft,
		type CuratedConditionDraft,
	} from './curated/curated-panel-state';
	import {
		getChartSourceSwitchWarning,
		getChartTypeSwitchWarning,
	} from '../workspace/state/switch-warnings';

	import { ConfirmDeleteViewModal } from './ConfirmDeleteWorkspaceModal';
	import { SwitchModeWarningModal } from './SwitchModeWarningModal';
	import Toolbar from './Toolbar.svelte';

	let {
		app,
		controller,
		onAutoSave,
		serializeDocument,
		onSessionStateChange,
		initialSession,
		workspaceFilePath,
		showDebugButton,
		openTemplateNoteInNewTab,
		initialDetailsNoteContentExpanded,
		onDetailsNoteContentExpandedChange,
		onOpenNodeInRightSplit,
		getNodeOpenMode,
		readOnly = false,
		sourceVersion = 2,
	}: {
		app: App;
		controller: WorkspaceController;
		onAutoSave: (document: PersistedMetaGraphDocumentV2) => Promise<void>;
		serializeDocument: (
			state: WorkspaceState,
		) => PersistedMetaGraphDocumentV2;
		onSessionStateChange: (session: WorkspaceSessionState) => void;
		initialSession?: WorkspaceSessionState;
		workspaceFilePath?: string;
		showDebugButton: boolean;
		openTemplateNoteInNewTab: boolean;
		initialDetailsNoteContentExpanded: boolean;
		onDetailsNoteContentExpandedChange: (expanded: boolean) => void;
		onOpenNodeInRightSplit: (nodeId: string) => Promise<void>;
		getNodeOpenMode: () => NodeOpenMode;
		readOnly?: boolean;
		sourceVersion?: number;
	} = $props();
	let workspaceState: WorkspaceState = $state(getInitialState());
	let workspaceRoot: HTMLDivElement;
	let canvas: HTMLDivElement;
	let findNoteInput: HTMLInputElement | undefined;
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
	let dockCuratedDropPreview = $state<DockCuratedDropPreview | undefined>(
		undefined,
	);
	let dockConnectionDrag = $state<DockDragPayload | undefined>(undefined);
	let dockTargetNodeId = $state<string | undefined>(undefined);
	const initialShellSession = readInitialShellSession();
	let dockOpen = $state(initialShellSession?.dockOpen ?? true);
	let curatedPanelOpen = $state(
		initialShellSession?.curatedPanelOpen ?? true,
	);
	let connectionOpen = $state(initialShellSession?.connectionOpen ?? true);
	let rightPanelTab = $state<WorkspaceRightPanelTab>(
		initialShellSession?.rightPanelTab ?? 'details',
	);
	let graphLoading = $state(false);
	let zoomLevel = $state(100);
	let graphLoadingTarget = $state<string | undefined>(undefined);
	let suppressNodeOpenUntil = 0;
	let activeNodeDropGroupId: string | undefined;
	const activeChartName = $derived(
		workspaceState.charts.find(
			(chart) => chart.id === workspaceState.activeChartId,
		)?.name ?? 'chart',
	);
	const graphLoadingName = $derived(graphLoadingTarget ?? activeChartName);
	const graphLoadingCoordinator = new GraphLoadingCoordinator({
		waitForPaint: () => waitForGraphLoadingPaint(window),
		onChange: (state) => {
			graphLoading = state.visible;
			graphLoadingTarget = state.label;
		},
	});

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
		setFlowRelationConflictCount: (count) =>
			controller.setFlowRelationConflictCount(count),
		setRenderPending: (pending) =>
			graphLoadingCoordinator.setRendererPending(pending),
		setZoomLevel: (level) => {
			zoomLevel = level;
		},
		isLargeVaultModeActive: () => controller.isLargeVaultModeActive(),
		yieldToMainThread: () => yieldForLargeVault(),
		recordPerformance: (name, durationMs, details) =>
			controller.recordPerformance(name, durationMs, details),
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
	const dockCuratedDrop = new DockCuratedDropController({
		window,
		readCanvas: () => canvas,
		readRenderer: () => rendererLifecycle.renderer,
		readChartSource: () => workspaceState.chartSource,
		readElementAtPoint: (clientX, clientY) =>
			readWorkspaceDocument().elementFromPoint(clientX, clientY),
		canStartDrag: (payload) => canStartCuratedDrop(payload),
		setDockDrag: (payload) => {
			dockDrag = payload;
		},
		setPreview: (preview) => {
			dockCuratedDropPreview = preview;
		},
		setActiveNodeDropGroupId: (groupId) => {
			activeNodeDropGroupId = groupId;
		},
		onDrop: (action) => handleDockCuratedDropAction(action),
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
			controller.selectNode(action.sourceNodeId);
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
					controller.selectNode(action.notePath);
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

	function readInitialShellSession(): WorkspaceSessionState['shell'] {
		return initialSession?.shell;
	}

	async function yieldForLargeVault(): Promise<void> {
		if (!controller.isLargeVaultModeActive()) return;
		await new Promise<void>((resolve) =>
			window.requestAnimationFrame(() => resolve()),
		);
	}

	function persistSession(state: WorkspaceState = workspaceState): void {
		onSessionStateChange(
			createWorkspaceSessionState(state, {
				rightPanelTab,
				dockOpen,
				curatedPanelOpen,
				connectionOpen,
			}),
		);
	}

	function toggleDock(): void {
		dockOpen = !dockOpen;
		persistSession();
	}

	function toggleCuratedPanel(): void {
		curatedPanelOpen = !curatedPanelOpen;
		persistSession();
	}

	function toggleConnection(): void {
		connectionOpen = !connectionOpen;
		persistSession();
	}

	function setRightPanelTab(tab: WorkspaceRightPanelTab): void {
		rightPanelTab = tab;
		persistSession();
	}

	onMount(() => {
		const autoSave = new WorkspaceAutoSave(
			onAutoSave,
			350,
			window,
			serializeDocument,
		);
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
		window.addEventListener('keydown', handleWindowShortcut, true);
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
			persistSession(nextState);
			if (changes.manualLayoutChanged) {
				renderBaseline.manualLayout = nextState.manualLayout;
				renderBaseline.grouping = nextState.grouping;
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
				syncRendererGroups();
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
			graphLoadingCoordinator.dispose();
			autoSave.flush();
			unsubscribe();
			resizeObserver.disconnect();
			themeObserver.disconnect();
			workspaceRoot.removeEventListener(
				'keydown',
				handleWorkspaceKeydown,
			);
			window.removeEventListener('keydown', handleWindowShortcut, true);
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
			dockCuratedDrop.reset();
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
			readOnly,
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
			onOpen: (nodeId) => void openNote(nodeId),
			onConnectionDrag: setGraphConnectionDrag,
			onConnect: connectVisibleNodes,
			onCommitManualNodePosition: (nodeId, position, groupId) => {
				controller.setManualNodePosition(nodeId, position, groupId);
			},
		});
	}

	async function openNote(nodeId: string): Promise<void> {
		if (getNodeOpenMode() === 'right-split') {
			await onOpenNodeInRightSplit(nodeId);
			return;
		}
		await controller.openNode(nodeId);
	}

	function syncRendererGroups(): void {
		const groupByNode = createWorkspaceGroupByNode(workspaceState);
		syncWorkspaceRendererGroups(
			rendererLifecycle.renderer,
			workspaceState.mode,
			workspaceState.manualLayout,
			workspaceState.grouping,
			groupByNode,
			getLayoutSnapshot(),
			workspaceState.enableForceLayout,
			{
				onMoveStart: () => {
					if (workspaceState.mode === 'graph') {
						rendererLifecycle.stopForceLayoutSimulation();
					}
				},
				onMovePreview: moveRuntimeGroupNodes,
				onMoveCommit: (groupId, delta) => {
					controller.moveGroup(
						groupId,
						delta,
						readRuntimeGroupPositions(groupId),
					);
				},
				onMoveEnd: () => {
					if (workspaceState.mode === 'graph') {
						rendererLifecycle.restartSigmaForceLayoutIfNeeded();
					}
				},
				onResizeCommit: (groupId, geometry) =>
					controller.resizeGroup(groupId, geometry),
			},
		);
	}

	function moveRuntimeGroupNodes(
		groupId: string,
		delta: { x: number; y: number },
	): void {
		const groupByNode = createWorkspaceGroupByNode(workspaceState);
		moveWorkspaceRuntimeGroupNodes(
			rendererLifecycle.renderer,
			getLayoutSnapshot(),
			[...groupByNode]
				.filter(([, assignedGroupId]) => assignedGroupId === groupId)
				.map(([nodeId]) => nodeId),
			delta,
		);
	}

	function readRuntimeGroupPositions(
		groupId: string,
	): Record<string, { x: number; y: number }> {
		const groupByNode = createWorkspaceGroupByNode(workspaceState);
		const positions = getLayoutSnapshot().positions;
		return Object.fromEntries(
			[...groupByNode].flatMap(([nodeId, assignedGroupId]) => {
				const position = positions.get(nodeId);
				return assignedGroupId === groupId && position
					? [[nodeId, position]]
					: [];
			}),
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
	const nodeColors = $derived.by(() => {
		const defaultColor = readInteractiveAccentColor(
			readWorkspaceDocument(),
		);
		return getWorkspaceNodeColors(
			debugSnapshot.index.nodes,
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

	async function switchActiveChart(id: string): Promise<void> {
		const targetChart = workspaceState.charts.find(
			(chart) => chart.id === id,
		);
		if (!targetChart || id === workspaceState.activeChartId) {
			return;
		}
		try {
			await graphLoadingCoordinator.runTransition(targetChart.name, () =>
				controller.setActiveChart(id),
			);
		} catch (error) {
			controller.setRendererDebugState({
				status: 'error',
				error: formatError(error),
			});
		}
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
			nodeSort: workspaceState.nodeSort,
			nodeSortDirection: workspaceState.nodeSortDirection,
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

	function requestChartTypeChange(type: ViewMode): void {
		const warning = getChartTypeSwitchWarning(workspaceState, type);
		if (!warning) {
			controller.setActiveChartType(type);
			return;
		}
		new SwitchModeWarningModal(
			app,
			warning,
			() => controller.setActiveChartType(type),
			() => controller.duplicateActiveChartAndSetType(type),
		).open();
	}

	function requestChartSourceChange(source: ChartSource): void {
		const warning = getChartSourceSwitchWarning(workspaceState, source);
		if (!warning) {
			controller.setActiveChartSource(source);
			return;
		}
		new SwitchModeWarningModal(
			app,
			warning,
			() => controller.setActiveChartSource(source),
			() => controller.duplicateActiveChartAndSetSource(source),
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
				controller.selectNode(action.notePath);
			})
			.catch((error: unknown) =>
				controller.setRendererDebugState({
					status: 'error',
					error: formatError(error),
				}),
			);
	}

	function handleDockCuratedDropAction(action: DockCuratedDropAction): void {
		if (action.kind === 'add-note') {
			controller.addCuratedFile(action.notePath, action.groupId);
			controller.setManualNodePosition(
				action.notePath,
				action.position,
				action.groupId,
			);
			controller.selectNode(action.notePath);
			return;
		}
		void openWorkspaceCreateStandaloneTemplateNote({
			app,
			controller,
			workspaceState,
			openTemplateNoteInNewTab,
			templateId: action.templateId,
			label: action.label,
			position: action.position,
			groupId: action.groupId,
			addToCurated: true,
			openNote,
		}).catch((error: unknown) =>
			controller.setRendererDebugState({
				status: 'error',
				error: formatError(error),
			}),
		);
	}

	function createStandaloneTemplateNote(
		templateId: string,
		label: string,
	): void {
		void openWorkspaceCreateStandaloneTemplateNote({
			app,
			controller,
			workspaceState,
			openTemplateNoteInNewTab,
			templateId,
			label,
			addToCurated: workspaceState.chartSource === 'curated',
			openNote,
		}).catch((error: unknown) =>
			controller.setRendererDebugState({
				status: 'error',
				error: formatError(error),
			}),
		);
	}

	function canStartCuratedDrop(payload: DockDragPayload): boolean {
		if (payload.kind === 'note') {
			return !workspaceState.projection?.nodes.some(
				(node) => node.id === payload.notePath,
			);
		}
		return payload.kind === 'template';
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
			openNote,
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
			openFile: (file) => openNote(file.path),
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
		if (focusFindNoteInput(event)) {
			return;
		}
		if (readOnly) return;
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

	function handleWindowShortcut(event: KeyboardEvent): void {
		if (
			!(event.target instanceof Node) ||
			!workspaceRoot.contains(event.target)
		) {
			return;
		}
		focusFindNoteInput(event);
	}

	function focusFindNoteInput(event: KeyboardEvent): boolean {
		if (
			!findNoteInput ||
			!shouldHandleFindNoteShortcut({
				key: event.key,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				altKey: event.altKey,
				shiftKey: event.shiftKey,
			})
		) {
			return false;
		}
		event.preventDefault();
		event.stopPropagation();
		findNoteInput.focus({ preventScroll: true });
		findNoteInput.select();
		return true;
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
		{readOnly}
		onSelectChart={switchActiveChart}
		onCreateChart={(input) => controller.addChart(input)}
		onRenameChart={(name) => controller.setActiveChartName(name)}
		onChartType={requestChartTypeChange}
		onChartSource={requestChartSourceChange}
		onDeleteChart={confirmDeleteActiveChart}
		onFocusNode={focusNodeFromSearch}
		onFindNoteInputEl={(element) => (findNoteInput = element)}
		onZoomIn={() => rendererLifecycle.zoomIn()}
		onZoomOut={() => rendererLifecycle.zoomOut()}
		{zoomLevel}
		onZoomLevel={(level) => rendererLifecycle.setZoomLevel(level)}
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
			aria-busy={graphLoading}
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
			<GraphLoadingOverlay
				visible={graphLoading}
				label={graphLoadingName}
			/>
			<div class="knowledge-workspace-obsidian-control" inert={readOnly}>
				<WorkspaceMainPanels
					{app}
					{controller}
					{workspaceState}
					{debugSnapshot}
					{workspaceFilePath}
					{nodeColors}
					{dockNoteEntries}
					{selectedNode}
					{selectedNodeColor}
					{atNodeLimit}
					{metadataFieldSuggestions}
					{connectionDrag}
					{graphConnectionTargetNotePath}
					{graphConnectionTargetTemplateId}
					{graphConnectionTargetCurated}
					{curatedSelection}
					{curatedConditionDraft}
					{dockDrag}
					{dockCuratedDropPreview}
					{dockConnectionDrag}
					{dockTargetNodeId}
					{dockOpen}
					{curatedPanelOpen}
					{connectionOpen}
					{rightPanelTab}
					{initialDetailsNoteContentExpanded}
					{onDetailsNoteContentExpandedChange}
					onToggleDock={toggleDock}
					onToggleCuratedPanel={toggleCuratedPanel}
					onToggleConnection={toggleConnection}
					onRightPanelTabChange={setRightPanelTab}
					onLinkPointerDown={dockGraphDrag.handlePointerDown}
					onCuratedPointerDown={dockCuratedDrop.handlePointerDown}
					onCreateTemplateNote={createStandaloneTemplateNote}
					onFocusNode={(nodeId) =>
						rendererLifecycle.focusNode(nodeId)}
					onOpenNote={(nodeId) => void openNote(nodeId)}
					onOpenMetadataLink={(linkText, sourcePath) =>
						void openMetadataLink(linkText, sourcePath)}
					onCuratedSelectionChange={(paths) => {
						curatedSelection = paths;
					}}
					onCuratedConditionDraftChange={updateCuratedConditionDraft}
					{formatError}
				/>
			</div>
		</main>
	</div>
	{#if debugOpen}
		<DebugPanel
			snapshot={debugSnapshot}
			onRefresh={() => controller.refresh(true)}
		/>
	{/if}
	{#if readOnly}
		<div class="knowledge-workspace-notice" role="status">
			Meta Graph v{sourceVersion} is newer than supported v2. Opened read-only.
		</div>
	{/if}
</div>
