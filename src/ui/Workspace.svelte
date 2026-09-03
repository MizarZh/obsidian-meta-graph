<script lang="ts">
	import { Menu, Notice, TFile, type App } from 'obsidian';
	import { onMount } from 'svelte';
	import type {
		ChartSource,
		DebugSnapshot,
		DockConnectionDirection,
		GraphProjection,
		KnowledgeNode,
		NodeOpenMode,
		SettingsPanelMode,
		ViewMode,
		WorkspaceState,
	} from '../core/types';
	import type {
		ConnectionPanelLayout,
		PersistedMetaGraphDocumentV2,
		WorkspaceRightPanelTab,
		WorkspaceSessionState,
	} from '../workspace/meta-graph-v2/types';
	import { createWorkspaceSessionState } from '../workspace/workspace-session';
	import { formatError as formatErrorMessage } from '../core/errors';
	import type {
		ConnectionDragState,
		GraphContextMenuTarget,
	} from '../graph/renderers/renderer-events';
	import { readGraphPalette } from '../graph/styles/graph-styles';
	import {
		refreshRendererGraphVisibility,
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
		WORKSPACE_ACTION_DEFINITIONS,
		resolvePinnedFocusNodeId,
		resolveWorkspaceShortcut,
		type WorkspaceActionId,
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
	import {
		syncWorkspaceRuntimeGraphStyles,
		syncWorkspaceRuntimeGraphVisibility,
	} from './workspace/runtime-graph';
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
	import { resolveGroupCapabilities } from '../workspace/groups/group-policy';

	import { ConfirmDeleteViewModal } from './ConfirmDeleteWorkspaceModal';
	import { SwitchModeWarningModal } from './SwitchModeWarningModal';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
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
		onWorkspaceActionsChange,
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
		onWorkspaceActionsChange?: (
			host:
				| {
						canExecute(action: WorkspaceActionId): boolean;
						execute(action: WorkspaceActionId): boolean;
				  }
				| undefined,
		) => void;
		readOnly?: boolean;
		sourceVersion?: number;
	} = $props();
	let workspaceState: WorkspaceState = $state(getInitialState());
	let hoveredNodeId: string | undefined;
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
	let connectionLayout = $state<ConnectionPanelLayout>(
		initialShellSession?.connectionLayout ?? 'single',
	);
	let connectionPanelHeight = $state(54);
	let rightPanelTab = $state<WorkspaceRightPanelTab>(
		initialShellSession?.rightPanelTab ?? 'details',
	);
	let graphLoading = $state(false);
	let shortcutHelpOpen = $state(false);
	let zoomLevel = $state(100);
	let graphLoadingTarget = $state<string | undefined>(undefined);
	let suppressNodeOpenUntil = 0;
	let activeNodeDropGroupId: string | undefined;
	let visibilityPaintFrame: number | undefined;
	let visibilityApplyFrame: number | undefined;
	let pendingVisibilityRenderer: GraphRenderer | undefined;
	let pendingVisibilityPrevious: GraphProjection | undefined;
	let pendingVisibilityNext: GraphProjection | undefined;
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
		readHoveredNodeId: () => hoveredNodeId,
		isLargeVaultModeActive: () => controller.isLargeVaultModeActive(),
		yieldToMainThread: () => yieldForLargeVault(),
		recordPerformance: (name, durationMs, details) =>
			controller.recordPerformance(name, durationMs, details),
	});
	const dockGraphDrag = new DockGraphDragController({
		window,
		readCanvas: () => canvas,
		readRenderer: () => rendererLifecycle.renderer,
		readHoveredNodeId: () => hoveredNodeId,
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
				connectionLayout,
			}),
		);
	}

	function scheduleRendererVisibilitySync(
		renderer: GraphRenderer,
		previousProjection: GraphProjection | undefined,
		nextProjection: GraphProjection,
	): void {
		if (pendingVisibilityRenderer !== renderer) {
			pendingVisibilityPrevious = previousProjection;
		}
		pendingVisibilityRenderer = renderer;
		pendingVisibilityNext = nextProjection;
		if (
			visibilityPaintFrame !== undefined ||
			visibilityApplyFrame !== undefined
		) {
			return;
		}
		visibilityPaintFrame = window.requestAnimationFrame(() => {
			visibilityPaintFrame = undefined;
			visibilityApplyFrame = window.requestAnimationFrame(() => {
				visibilityApplyFrame = undefined;
				applyPendingRendererVisibility();
			});
		});
	}

	function applyPendingRendererVisibility(): void {
		const renderer = pendingVisibilityRenderer;
		const previousProjection = pendingVisibilityPrevious;
		const nextProjection = pendingVisibilityNext;
		pendingVisibilityRenderer = undefined;
		pendingVisibilityPrevious = undefined;
		pendingVisibilityNext = undefined;
		if (
			!renderer ||
			!nextProjection ||
			rendererLifecycle.renderer !== renderer
		) {
			return;
		}
		const changedNodeIds = readChangedVisibilityNodeIds(
			previousProjection,
			nextProjection,
		);
		if (changedNodeIds.length === 0) {
			return;
		}
		const startedAt = performance.now();
		const changes = syncWorkspaceRuntimeGraphVisibility(
			renderer.runtimeGraph,
			nextProjection,
			changedNodeIds,
		);
		if (changes.nodeIds.length > 0 || changes.edgeIds.length > 0) {
			refreshRendererGraphVisibility(renderer, changes);
		}
		controller.recordPerformance(
			'render.visibility',
			performance.now() - startedAt,
			{
				nodeCount: changes.nodeIds.length,
				edgeCount: changes.edgeIds.length,
			},
		);
	}

	function cancelPendingRendererVisibilitySync(): void {
		if (visibilityPaintFrame !== undefined) {
			window.cancelAnimationFrame(visibilityPaintFrame);
			visibilityPaintFrame = undefined;
		}
		if (visibilityApplyFrame !== undefined) {
			window.cancelAnimationFrame(visibilityApplyFrame);
			visibilityApplyFrame = undefined;
		}
		pendingVisibilityRenderer = undefined;
		pendingVisibilityPrevious = undefined;
		pendingVisibilityNext = undefined;
	}

	function readChangedVisibilityNodeIds(
		previousProjection: GraphProjection | undefined,
		nextProjection: GraphProjection,
	): string[] {
		if (!previousProjection) {
			return nextProjection.nodes.map((node) => node.id);
		}
		const previousHidden = previousProjection.hiddenNodeIds ?? new Set();
		const nextHidden = nextProjection.hiddenNodeIds ?? new Set();
		const changed = new Set<string>();
		for (const nodeId of previousHidden) {
			if (!nextHidden.has(nodeId)) {
				changed.add(nodeId);
			}
		}
		for (const nodeId of nextHidden) {
			if (!previousHidden.has(nodeId)) {
				changed.add(nodeId);
			}
		}
		return [...changed];
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

	function setConnectionLayout(layout: ConnectionPanelLayout): void {
		connectionLayout = layout;
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
		workspaceRoot.addEventListener(
			'pointerdown',
			focusWorkspaceForShortcuts,
		);
		onWorkspaceActionsChange?.({
			canExecute: canExecuteWorkspaceAction,
			execute: executeWorkspaceAction,
		});
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
			const previousState = workspaceState;
			const changes = analyzeWorkspaceStateChanges(
				nextState,
				previousState,
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
				if (
					changes.graphVisibilityChanged &&
					!changes.styleRulesChanged &&
					!changes.manualLayoutChanged
				) {
					scheduleRendererVisibilitySync(
						currentRenderer,
						previousState.projection,
						nextState.projection,
					);
				} else {
					cancelPendingRendererVisibilitySync();
					syncWorkspaceRuntimeGraphStyles(
						currentRenderer.runtimeGraph,
						nextState.projection,
						nextState,
						readGraphPalette(canvas),
					);
					refreshRendererGraphStyles(currentRenderer);
				}
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
				cancelPendingRendererVisibilitySync();
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
				rendererLifecycle.setSelection(
					nextState.selectedNodeId,
					nextState.selectedEdgeId,
					nextState.selectedGroupId,
				);
				rendererLifecycle.setHovered(hoveredNodeId);
			}
		});

		return () => {
			graphLoadingCoordinator.dispose();
			cancelPendingRendererVisibilitySync();
			autoSave.flush();
			unsubscribe();
			resizeObserver.disconnect();
			themeObserver.disconnect();
			workspaceRoot.removeEventListener(
				'keydown',
				handleWorkspaceKeydown,
			);
			onWorkspaceActionsChange?.(undefined);
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
			onSelectEdge: (edgeId) => controller.selectEdge(edgeId),
			onSelectGroup: (groupId) => controller.selectGroup(groupId),
			onHover: (nodeId?: string) => {
				hoveredNodeId = nodeId;
				rendererLifecycle.setHovered(nodeId);
			},
			onOpen: (nodeId) => void openNote(nodeId),
			onContextMenu: showGraphContextMenu,
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

	async function openNoteInNewTab(nodeId: string): Promise<void> {
		const file = app.vault.getAbstractFileByPath(nodeId);
		if (file instanceof TFile) {
			await app.workspace.getLeaf('tab').openFile(file);
		}
	}

	function showGraphContextMenu(
		target: GraphContextMenuTarget,
		event: MouseEvent,
	): void {
		const menu = new Menu();
		if (target.kind === 'node') {
			addNodeContextMenuItems(menu, target.nodeId);
		} else if (target.kind === 'edge') {
			addEdgeContextMenuItems(menu, target.edgeId);
		} else if (target.kind === 'group') {
			addGroupContextMenuItems(menu, target.groupId);
		} else {
			addStageContextMenuItems(menu);
		}
		menu.showAtMouseEvent(event);
	}

	function addNodeContextMenuItems(menu: Menu, nodeId: string): void {
		menu.addItem((item) =>
			item
				.setTitle('Open')
				.setIcon('file')
				.onClick(() => void openNote(nodeId)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Open in new tab')
				.setIcon('file-plus')
				.onClick(() => void openNoteInNewTab(nodeId)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Focus relationships')
				.setIcon('pin')
				.onClick(() => rendererLifecycle.togglePinnedHover(nodeId)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Show details')
				.setIcon('panel-right')
				.onClick(showSelectionDetails),
		);

		const capabilities = resolveGroupCapabilities(workspaceState.mode);
		const groups = capabilities.canAssignManually
			? workspaceState.grouping.groups
			: [];
		if (groups.length > 0) {
			menu.addSeparator();
			const currentGroupId =
				createWorkspaceGroupByNode(workspaceState).get(nodeId);
			for (const group of groups) {
				menu.addItem((item) =>
					item
						.setTitle(`Move to group: ${group.name}`)
						.setIcon('folder-input')
						.setChecked(currentGroupId === group.id)
						.setDisabled(readOnly || currentGroupId === group.id)
						.onClick(() =>
							controller.setNodeGroup(nodeId, group.id),
						),
				);
			}
			if (workspaceState.mode !== 'cube' && currentGroupId) {
				menu.addItem((item) =>
					item
						.setTitle('Remove from group')
						.setIcon('folder-minus')
						.setDisabled(readOnly)
						.onClick(() => controller.setNodeGroup(nodeId, null)),
				);
			}
		}

		menu.addSeparator();
		if (workspaceState.chartSource === 'curated') {
			menu.addItem((item) =>
				item
					.setTitle('Hide note')
					.setIcon('eye-off')
					.setDisabled(readOnly)
					.onClick(() =>
						controller.setCuratedFilesHidden([nodeId], true),
					),
			);
		}
		menu.addItem((item) =>
			item
				.setTitle('Copy wiki link')
				.setIcon('copy')
				.onClick(
					() =>
						void copyContextText(
							`[[${nodeId.replace(/\.md$/i, '')}]]`,
						),
				),
		);
	}

	function addEdgeContextMenuItems(menu: Menu, edgeId: string): void {
		const edge = workspaceState.projection?.edges.find(
			(item) => item.id === edgeId,
		);
		menu.addItem((item) =>
			item
				.setTitle('Show details')
				.setIcon('panel-right')
				.onClick(showSelectionDetails),
		);
		if (!edge) return;
		const sourceTitle = getContextNodeTitle(edge.source);
		const targetTitle = getContextNodeTitle(edge.target);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle(`Open source: ${sourceTitle}`)
				.setIcon('file-input')
				.onClick(() => void openNote(edge.source)),
		);
		menu.addItem((item) =>
			item
				.setTitle(`Open target: ${targetTitle}`)
				.setIcon('file-output')
				.onClick(() => void openNote(edge.target)),
		);
		menu.addItem((item) =>
			item
				.setTitle(`Focus source: ${sourceTitle}`)
				.setIcon('pin')
				.onClick(() =>
					rendererLifecycle.togglePinnedHover(edge.source),
				),
		);
		menu.addItem((item) =>
			item
				.setTitle(`Focus target: ${targetTitle}`)
				.setIcon('pin')
				.onClick(() =>
					rendererLifecycle.togglePinnedHover(edge.target),
				),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Copy relationship')
				.setIcon('copy')
				.onClick(
					() =>
						void copyContextText(
							`${sourceTitle} ${edge.directed ? `—[${edge.relation}]→` : `—[${edge.relation}]—`} ${targetTitle}`,
						),
				),
		);
	}

	function addGroupContextMenuItems(menu: Menu, groupId: string): void {
		const group = workspaceState.grouping.groups.find(
			(item) => item.id === groupId,
		);
		menu.addItem((item) =>
			item
				.setTitle(group?.name ?? 'Group')
				.setIcon('group')
				.setIsLabel(true),
		);
		menu.addItem((item) =>
			item
				.setTitle('Show details')
				.setIcon('panel-right')
				.onClick(showSelectionDetails),
		);
		const capabilities = resolveGroupCapabilities(
			workspaceState.mode,
			group,
		);
		if (capabilities.canDelete) {
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle('Delete group')
					.setIcon('trash-2')
					.setDisabled(readOnly)
					.onClick(() => controller.deleteGroup(groupId)),
			);
		}
	}

	function addStageContextMenuItems(menu: Menu): void {
		menu.addItem((item) =>
			item
				.setTitle('Fit graph')
				.setIcon('maximize')
				.onClick(() => rendererLifecycle.fit()),
		);
		menu.addItem((item) =>
			item
				.setTitle('Reset zoom')
				.setIcon('scan')
				.onClick(() => rendererLifecycle.setZoomLevel(100)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Refresh')
				.setIcon('refresh-cw')
				.onClick(() => void controller.refresh(true)),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Clear selection and focus')
				.setIcon('circle-off')
				.onClick(() => {
					rendererLifecycle.clearPinnedHover();
					controller.selectNode(undefined);
				}),
		);
		if (resolveGroupCapabilities(workspaceState.mode).canCreate) {
			menu.addItem((item) =>
				item
					.setTitle('Add group')
					.setIcon('folder-plus')
					.setDisabled(readOnly)
					.onClick(() => controller.addGroup()),
			);
		}
	}

	function showSelectionDetails(): void {
		rightPanelTab = 'details';
		dockOpen = true;
		persistSession();
	}

	function getContextNodeTitle(nodeId: string): string {
		return (
			workspaceState.projection?.nodes.find((node) => node.id === nodeId)
				?.title ?? nodeId
		);
	}

	async function copyContextText(value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			new Notice('Copied to clipboard');
		} catch {
			new Notice('Unable to copy to clipboard');
		}
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
				onSelectGroup: (groupId) => controller.selectGroup(groupId),
				onContextMenu: (groupId, event) =>
					showGraphContextMenu({ kind: 'group', groupId }, event),
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
	const indexedNodes: KnowledgeNode[] = $derived.by(() => {
		void workspaceState.projection;
		return controller.getIndexedNodes();
	});
	const indexedNodeSnapshot = $derived({ index: { nodes: indexedNodes } });
	let nodeColorCacheKey: unknown[] = [];
	let cachedNodeColors = new Map<string, string>();
	const nodeColors = $derived.by(() => {
		const defaultColor = readInteractiveAccentColor(
			readWorkspaceDocument(),
		);
		const cacheKey = [
			indexedNodes,
			defaultColor,
			workspaceState.defaultNodeStyle,
			workspaceState.nodeStyleOverrides,
			workspaceState.globalNodeStyleRules,
			workspaceState.nodeStyleRules,
			workspaceState.grouping,
			workspaceState.manualLayout,
		];
		if (
			cacheKey.length === nodeColorCacheKey.length &&
			cacheKey.every((value, index) => value === nodeColorCacheKey[index])
		) {
			return cachedNodeColors;
		}
		nodeColorCacheKey = cacheKey;
		cachedNodeColors = getWorkspaceNodeColors(
			indexedNodes,
			workspaceState,
			defaultColor,
		);
		return cachedNodeColors;
	});
	const dockNoteEntries = $derived(
		getDockNoteEntries(
			indexedNodeSnapshot,
			workspaceState.dock.notes,
			nodeColors,
		),
	);
	const metadataFieldSuggestions = $derived(
		getMetadataFieldSuggestions(indexedNodes),
	);
	const metadataFieldTypes = $derived(getMetadataFieldTypes(indexedNodes));
	const metadataFieldValueSuggestions = $derived(
		getMetadataFieldValueSuggestions(indexedNodes, metadataFieldTypes),
	);
	const filePathSuggestions = $derived(
		getFilePathSuggestions(indexedNodeSnapshot),
	);
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
		const toolbarTarget =
			panel === 'groups'
				? workspaceRoot?.querySelector<HTMLElement>(
						'.knowledge-workspace-settings-tab-groups',
					)
				: undefined;
		const target = toolbarTarget ?? event.currentTarget;
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
		const copyQueryNotesToCurated =
			workspaceState.chartSource === 'query' && source === 'curated';
		const queryNotePaths = copyQueryNotesToCurated
			? readCurrentQueryNotePaths()
			: [];
		new SwitchModeWarningModal(
			app,
			warning,
			() => controller.setActiveChartSource(source, queryNotePaths),
			() =>
				controller.duplicateActiveChartAndSetSource(
					source,
					queryNotePaths,
				),
			copyQueryNotesToCurated ? 'Copy to Curated' : undefined,
		).open();
	}

	function readCurrentQueryNotePaths(): string[] {
		const paths = new Set<string>();
		for (const node of workspaceState.projection?.nodes ?? []) {
			if (node.kind === 'unresolved') {
				continue;
			}
			const path = node.path.trim();
			if (path) {
				paths.add(path);
			}
		}
		return [...paths];
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
		if (event.defaultPrevented) return;
		const action = resolveWorkspaceShortcut({
			key: event.key,
			ctrlKey: event.ctrlKey,
			metaKey: event.metaKey,
			altKey: event.altKey,
			shiftKey: event.shiftKey,
			connectionUndoCount: workspaceState.connectionUndoCount,
			connectionRedoCount: workspaceState.connectionRedoCount,
			editableTarget: isEditableTarget(event.target),
			selectedNodeId: workspaceState.selectedNodeId,
			hoveredNodeId,
		});
		if (!action || !executeWorkspaceAction(action)) return;
		event.preventDefault();
		event.stopPropagation();
	}

	function undoLastConnection(): void {
		if (workspaceState.connectionUndoCount === 0) return;
		void controller.undoLastConnection().catch((error: unknown) =>
			controller.setRendererDebugState({
				status: 'error',
				error: formatError(error),
			}),
		);
	}

	function redoLastConnection(): void {
		if (workspaceState.connectionRedoCount === 0) return;
		void controller.redoLastConnection().catch((error: unknown) =>
			controller.setRendererDebugState({
				status: 'error',
				error: formatError(error),
			}),
		);
	}

	function focusFindNoteInput(): boolean {
		if (!findNoteInput) return false;
		findNoteInput.focus({ preventScroll: true });
		findNoteInput.select();
		return true;
	}

	function canExecuteWorkspaceAction(action: WorkspaceActionId): boolean {
		if (action === 'find-note') return Boolean(findNoteInput);
		if (action === 'undo')
			return !readOnly && workspaceState.connectionUndoCount > 0;
		if (action === 'redo')
			return !readOnly && workspaceState.connectionRedoCount > 0;
		if (action === 'open-selected') {
			return Boolean(workspaceState.selectedNodeId);
		}
		if (action === 'toggle-curated-panel') {
			return workspaceState.chartSource === 'curated';
		}
		if (action === 'previous-view' || action === 'next-view') {
			return workspaceState.charts.length > 1;
		}
		return true;
	}

	function executeWorkspaceAction(action: WorkspaceActionId): boolean {
		if (!canExecuteWorkspaceAction(action)) return false;
		switch (action) {
			case 'find-note':
				return focusFindNoteInput();
			case 'undo':
				undoLastConnection();
				return true;
			case 'redo':
				redoLastConnection();
				return true;
			case 'open-selected':
				void openNote(workspaceState.selectedNodeId!);
				return true;
			case 'toggle-pinned-focus':
				{
					const nodeId = resolvePinnedFocusNodeId({
						selectedNodeId: workspaceState.selectedNodeId,
						hoveredNodeId,
					});
					if (nodeId) {
						rendererLifecycle.togglePinnedHover(nodeId);
					} else {
						rendererLifecycle.clearPinnedHover();
					}
				}
				return true;
			case 'fit-graph':
				rendererLifecycle.fit();
				return true;
			case 'reset-zoom':
				rendererLifecycle.setZoomLevel(100);
				return true;
			case 'zoom-in':
				rendererLifecycle.zoomIn();
				return true;
			case 'zoom-out':
				rendererLifecycle.zoomOut();
				return true;
			case 'refresh-graph':
				void controller.refresh(true);
				return true;
			case 'show-shortcuts':
				shortcutHelpOpen = !shortcutHelpOpen;
				return true;
			case 'toggle-dock':
				toggleDock();
				return true;
			case 'toggle-curated-panel':
				toggleCuratedPanel();
				return true;
			case 'toggle-connection-panel':
				toggleConnection();
				return true;
			case 'previous-view':
			case 'next-view': {
				const index = workspaceState.charts.findIndex(
					(chart) => chart.id === workspaceState.activeChartId,
				);
				const delta = action === 'previous-view' ? -1 : 1;
				const next =
					workspaceState.charts[
						(index + delta + workspaceState.charts.length) %
							workspaceState.charts.length
					];
				if (next) void switchActiveChart(next.id);
				return Boolean(next);
			}
			case 'escape':
				if (shortcutHelpOpen) shortcutHelpOpen = false;
				else if (settingsPanel) settingsPanel = undefined;
				else if (curatedSelection.size > 0)
					curatedSelection = new Set();
				else {
					rendererLifecycle.clearPinnedHover();
					controller.selectNode(undefined);
				}
				return true;
		}
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
		connectionUndoCount={workspaceState.connectionUndoCount}
		connectionRedoCount={workspaceState.connectionRedoCount}
		onUndoConnection={undoLastConnection}
		onRedoConnection={redoLastConnection}
		onFit={() => rendererLifecycle.fit()}
		onRefresh={() => controller.refresh(true)}
		{settingsPanel}
		onSettingsPanel={openSettingsPanel}
		{showDebugButton}
		{debugOpen}
		onToggleDebug={toggleDebug}
		shortcutsOpen={shortcutHelpOpen}
		onShowShortcuts={() => (shortcutHelpOpen = !shortcutHelpOpen)}
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
				{readOnly}
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
					: '0px'}; --connection-panel-height: {connectionOpen
				? `${connectionPanelHeight}px`
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
					{indexedNodes}
					{workspaceFilePath}
					{nodeColors}
					{dockNoteEntries}
					{selectedNode}
					{selectedNodeColor}
					{readOnly}
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
					{connectionLayout}
					{rightPanelTab}
					{initialDetailsNoteContentExpanded}
					{onDetailsNoteContentExpandedChange}
					onToggleDock={toggleDock}
					onToggleCuratedPanel={toggleCuratedPanel}
					onToggleConnection={toggleConnection}
					onConnectionLayoutChange={setConnectionLayout}
					onConnectionPanelHeightChange={(height) => {
						connectionPanelHeight = Math.max(54, Math.ceil(height));
					}}
					onRightPanelTabChange={setRightPanelTab}
					onLinkPointerDown={dockGraphDrag.handlePointerDown}
					onCuratedPointerDown={dockCuratedDrop.handlePointerDown}
					onCreateTemplateNote={createStandaloneTemplateNote}
					onFocusNode={(nodeId) =>
						rendererLifecycle.focusNode(nodeId)}
					onOpenNote={(nodeId) => void openNote(nodeId)}
					onOpenMetadataLink={(linkText, sourcePath) =>
						void openMetadataLink(linkText, sourcePath)}
					onEditGroup={(event) => openSettingsPanel('groups', event)}
					onCuratedSelectionChange={(paths) => {
						curatedSelection = paths;
					}}
					onCuratedConditionDraftChange={updateCuratedConditionDraft}
					{formatError}
				/>
			</div>
		</main>
		{#if shortcutHelpOpen}
			<aside
				class="knowledge-workspace-shortcut-panel"
				aria-label="Keyboard shortcuts"
			>
				<header>
					<h3>Keyboard shortcuts</h3>
					<ObsidianButton
						icon="x"
						ariaLabel="Close keyboard shortcuts"
						tooltip="Close"
						onClick={() => (shortcutHelpOpen = false)}
					/>
				</header>
				<div class="knowledge-workspace-shortcut-list">
					{#each ['Navigation', 'Selection', 'History'] as group}
						<section>
							<h4>{group}</h4>
							<div class="knowledge-workspace-shortcut-group">
								{#each WORKSPACE_ACTION_DEFINITIONS.filter((action) => action.shortcut && action.group === group) as action}
									<div
										class="knowledge-workspace-shortcut-row"
									>
										<span>{action.label}</span>
										<div
											class="knowledge-workspace-shortcut-keys"
										>
											{#each action.shortcut
												?.replaceAll('Mod', navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl')
												.split(' / ') ?? [] as shortcut, index}
												{#if index > 0}<span>or</span
													>{/if}
												<kbd>{shortcut}</kbd>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</section>
					{/each}
				</div>
			</aside>
		{/if}
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
