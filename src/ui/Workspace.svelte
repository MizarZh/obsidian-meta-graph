<script lang="ts">
	import { TFile, type App } from "obsidian";
	import { onMount } from "svelte";
		import type {
			DebugSnapshot,
			DockConnectionDirection,
			MetaGraphDocument,
			SettingsPanelMode,
			WorkspaceState,
		} from "../core/types";
		import { formatError as formatErrorMessage } from "../core/errors";
		import type { ConnectionDragState } from "../graph/graph-events";
		import {
			GraphologyAdapter,
			type RuntimeGraph,
		} from "../graph/graphology-adapter";
		import {
			getActiveDefaultLinkStyle,
			getActiveDefaultNodeStyle,
			getActiveLinkStyleRules,
			getActiveNodeStyleRules,
		} from "../graph/active-styles";
		import { readGraphPalette } from "../graph/graph-styles";
		import {
			createGraphRenderer,
			getModeCapabilities,
			getRendererKind,
			getRendererKindForMode,
			isCube3DRenderer,
			isForce3DRenderer,
			setRendererManualLayout,
			setRendererPalette,
			type GraphRenderer,
		} from "../graph/renderer-adapter";
		import { bindRendererEvents } from "../graph/renderer-events-adapter";
		import { serializeRuntimeGraph } from "../graph/runtime-graph-debug";
		import { resolveNodeStyle, type NodeStyle } from "../graph/style-rules";
		import { SigmaRenderer } from "../graph/sigma-renderer";
		import {
			applyStableLayout as applyStableRuntimeLayout,
			hydrateManualLayoutPositions,
			LayoutSnapshotStore,
			type LayoutSnapshot,
		} from "../layouts/stable-layout";
		import { D3ForceSimulation } from "../layouts/d3-force-simulation";
	import { extractLinkText } from "../core/link-resolver";
	import type { WorkspaceController } from "../workspace/workspace-controller";
	import CuratedPanel from "./CuratedPanel.svelte";
	import FilterPanel from "./FilterPanel.svelte";
	import GroupPanel from "./GroupPanel.svelte";
		import DebugPanel from "./DebugPanel.svelte";
		import DockGraphPanel from "./DockGraphPanel.svelte";
		import type { DockDragPayload } from "./dock/types";
		import {
			readDockDropTarget,
			readElementCenterViewportPosition,
			readElementAtPoint,
			readViewportPoint as readViewportPointFromContainer,
		} from "./dock/dom";
		import {
			resolveDockPayloadGraphAction,
			type DockPayloadGraphAction,
		} from "./dock/connection";
		import {
			createDockConnectionDragState,
			updateDockConnectionDragState,
		} from "./dock/connection-drag";
		import { canDockPayloadTargetNode } from "./dock/drag";
		import {
			getMetadataFieldSuggestions,
			getMetadataFieldTypes,
			getMetadataFieldValueSuggestions,
		} from "./filter-config";
		import {
			resolveGraphConnectionDropAction,
			type GraphConnectionDropAction,
		} from "./interactions/graph-connection-drop";
		import {
			getNextNodeOpenSuppressUntil,
			getSigmaDragAction,
			getSigmaDragEndAction,
			shouldOpenNode,
		} from "./interactions/graph-interaction-policy";
		import { shouldHandleConnectionUndoShortcut } from "./interactions/keyboard-shortcuts";
		import {
			getManualGroupNodeIds,
			moveRuntimeManualGroupNodes,
		} from "./interactions/manual-layout-groups";
	import {
		getDockNoteCandidates,
		getFilePathSuggestions,
		getSelectedDockNodes,
	} from "./workspace/derived";
	import { syncRendererDisplaySettings } from "./workspace/renderer-display-sync";
	import { getWorkspaceGraphForceSettings } from "./workspace/graph-settings";
	import { WorkspaceAutoSave } from "./workspace/autosave";
	import {
		analyzeWorkspaceStateChanges,
		createWorkspaceRenderBaseline,
		type WorkspaceRenderBaseline,
	} from "./workspace/change-tracker";

	import Inspector from "./Inspector.svelte";
	import ConnectionPanel from "./ConnectionPanel.svelte";
	import { ConfirmDeleteViewModal } from "./ConfirmDeleteWorkspaceModal";
	import { CreateFromTemplateModal } from "./CreateFromTemplateModal";
	import Toolbar from "./Toolbar.svelte";

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
	let renderer: GraphRenderer | undefined;
	let unbindEvents: (() => void) | undefined;
	let renderVersion = 0;
		let lastThemeSignature = "";
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
	let dockDrag = $state<DockDragPayload | undefined>(undefined);
	let dockConnectionDrag = $state<DockDragPayload | undefined>(undefined);
	let dockTargetNodeId = $state<string | undefined>(undefined);
		let dockOpen = $state(true);
		let curatedPanelOpen = $state(true);
		let connectionOpen = $state(true);
		let forceLayoutSimulation: D3ForceSimulation | undefined;
		let suppressNodeOpenUntil = 0;
		let activeNodeDropGroupId: string | undefined;

	const layoutSnapshots = new LayoutSnapshotStore();
		const handleGraphConnectionMouseMove = (event: MouseEvent): void => {
			if (!connectionDrag || dockConnectionDrag) {
				return;
			}
			const target = readDockDropTarget(readElementAtMouseEvent(event));
			graphConnectionTargetNotePath = target.notePath;
			graphConnectionTargetTemplateId = target.templateId;
			graphConnectionTargetCurated = target.curated;
		};
		const handleGraphConnectionMouseUp = (event: MouseEvent): void => {
			if (!connectionDrag || dockConnectionDrag) {
				return;
			}
			const action = resolveGraphConnectionDropAction(
				connectionDrag.sourceNodeId,
				{
					notePath: graphConnectionTargetNotePath,
					templateId: graphConnectionTargetTemplateId,
					curated: graphConnectionTargetCurated,
				},
				readDockDropTarget(readElementAtMouseEvent(event)),
			);
			if (action.kind === "none") {
				return;
			}
			resetGraphConnectionTarget();
			handleGraphConnectionDropAction(action);
		};
	const handleGraphConnectionPointerMove = (event: PointerEvent): void => {
		handleGraphConnectionMouseMove(event);
	};
		const handleGraphConnectionPointerUp = (event: PointerEvent): void => {
			handleGraphConnectionMouseUp(event);
		};

		function resetGraphConnectionTarget(): void {
			graphConnectionTargetNotePath = undefined;
			graphConnectionTargetTemplateId = undefined;
			graphConnectionTargetCurated = false;
		}

		function handleGraphConnectionDropAction(
			action: GraphConnectionDropAction,
		): void {
			if (action.kind === "add-curated") {
				controller.addCuratedFile(action.sourceNodeId);
				return;
			}
			if (action.kind === "create-from-template") {
				openCreateFromTemplateId(
					action.templateId,
					action.sourceNodeId,
					undefined,
					"from-graph-to-dock",
				);
				return;
			}
			if (action.kind === "connect-note") {
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
							status: "error",
							error: formatError(error),
						}),
					);
			}
		}

		function connectVisibleNodes(sourceNodeId: string, targetNodeId: string): void {
			void controller
				.connectNodes(
					sourceNodeId,
					targetNodeId,
					workspaceState.activeConnectionField,
				)
				.catch((error: unknown) =>
					controller.setRendererDebugState({
						status: "error",
						error: formatError(error),
					}),
				);
		}

		function setGraphConnectionDrag(state: ConnectionDragState | undefined): void {
			connectionDrag = state;
			if (!state) {
				resetGraphConnectionTarget();
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
					renderer?.resize();
				}
			});
		resizeObserver.observe(canvas);
		lastThemeSignature = readThemeSignature();
		const themeObserver = new MutationObserver(() => {
			refreshRendererTheme();
		});
		themeObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ["class"],
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		workspaceRoot.addEventListener("keydown", handleWorkspaceKeydown);
		workspaceRoot.addEventListener(
			"pointerdown",
			focusWorkspaceForShortcuts,
		);
		window.addEventListener("mousemove", handleGraphConnectionMouseMove, {
			capture: true,
		});
		window.addEventListener("mouseup", handleGraphConnectionMouseUp, {
			capture: true,
		});
		window.addEventListener("pointermove", handleGraphConnectionPointerMove, {
			capture: true,
		});
		window.addEventListener("pointerup", handleGraphConnectionPointerUp, {
			capture: true,
		});

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
				(nextState.chartSource === "curated" &&
					settingsPanel === "filters") ||
				(nextState.chartSource === "query" &&
					settingsPanel === "workspace")
			) {
				settingsPanel = undefined;
			}
			autoSave.schedule(nextState);
			syncRendererDisplaySettings(renderer, nextState, changes);
			if (changes.forceLayoutChanged && renderer) {
				if (isForce3DRenderer(renderer)) {
					renderer.setEnableForceLayout(nextState.enableForceLayout);
				}
				unbindEvents?.();
				unbindEvents = bindEventsForRenderer(renderer);
				stopForceLayoutSimulation();
				}
				if (
					changes.graphForceSettingsChanged &&
					getModeCapabilities(nextState.mode).usesSigmaForceSimulation &&
					nextState.enableForceLayout &&
					renderer &&
				!isForce3DRenderer(renderer) &&
				!isCube3DRenderer(renderer)
			) {
				stopForceLayoutSimulation();
				getOrCreateForceLayoutSimulation(renderer).start();
			}
			if (changes.shouldRebuild) {
				renderBaseline = createWorkspaceRenderBaseline(nextState);
					void rebuildGraph(
						changes.fitAfterRender,
						changes.forceLayout,
					).catch((error: unknown) => {
						controller.setRendererDebugState({
							status: "error",
							error: formatError(error),
						});
					});
			} else {
				renderer?.setSelected(nextState.selectedNodeId);
				renderer?.setHovered(nextState.hoveredNodeId);
			}
		});

		return () => {
			renderVersion += 1;
			autoSave.flush();
			unsubscribe();
			resizeObserver.disconnect();
			themeObserver.disconnect();
			workspaceRoot.removeEventListener(
				"keydown",
				handleWorkspaceKeydown,
			);
			workspaceRoot.removeEventListener(
				"pointerdown",
				focusWorkspaceForShortcuts,
			);
			window.removeEventListener(
				"mousemove",
				handleGraphConnectionMouseMove,
				{
					capture: true,
				},
			);
			window.removeEventListener(
				"mouseup",
				handleGraphConnectionMouseUp,
				{
					capture: true,
				},
			);
			window.removeEventListener(
				"pointermove",
				handleGraphConnectionPointerMove,
				{
					capture: true,
				},
			);
			window.removeEventListener(
				"pointerup",
				handleGraphConnectionPointerUp,
				{
					capture: true,
				},
			);
				resetDockConnectionDrag();
				unbindEvents?.();
				stopForceLayoutSimulation();
				renderer?.kill();
		};
	});

	function readThemeSignature(): string {
		return `${document.documentElement.className}|${document.body.className}`;
	}

	function refreshRendererTheme(): void {
		const themeSignature = readThemeSignature();
		if (themeSignature === lastThemeSignature) {
			return;
		}
		lastThemeSignature = themeSignature;
				if (renderer && canvas) {
					setRendererPalette(renderer, readGraphPalette(canvas));
				}
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
			stopForceLayoutSimulation();
			renderer?.kill();
			renderer = undefined;
			controller.setRendererDebugState({ status: "idle" });
			return;
		}

			controller.setRendererDebugState({
				status: "waiting-for-size",
				mode: workspaceState.mode,
			container: readContainerSize(),
		});
		const hasSize = await waitForCanvasSize();
		if (!hasSize || version !== renderVersion) {
			if (!hasSize) {
				throw new Error(
					"The Sigma container has zero width or height after waiting for layout.",
				);
			}
			return;
		}

			const palette = readGraphPalette(canvas);
			const layoutSnapshot = getLayoutSnapshot();
				hydrateManualLayoutPositions(
					layoutSnapshot,
					workspaceState.mode,
					workspaceState.manualLayout,
				);
			const positions = layoutSnapshot.positions;
		const graph = new GraphologyAdapter(
			palette,
					getActiveDefaultNodeStyle(workspaceState, palette.node),
					getActiveDefaultLinkStyle(workspaceState, palette.edge),
					getActiveNodeStyleRules(workspaceState),
					getActiveLinkStyleRules(workspaceState),
		).fromProjection(workspaceState.projection, positions);
		const newNodeIds = graph
			.nodes()
			.filter((nodeId) => !positions.has(nodeId));
		controller.setRendererDebugState({
			status: "layout",
			mode: workspaceState.mode,
			container: readContainerSize(),
			runtimeGraph: serializeRuntimeGraph(graph),
		});
			await applyStableRuntimeLayout(graph, layoutSnapshot, newNodeIds, {
				mode: workspaceState.mode,
				forceLayout,
				graphSpacing: workspaceState.graphSpacing,
				graphForceSettings: getWorkspaceGraphForceSettings(workspaceState),
				flowEdgeStyle: workspaceState.flowEdgeStyle,
				flowDirection: workspaceState.flowDirection,
				flowSpacing: workspaceState.flowSpacing,
				arcSpacing: workspaceState.arcSpacing,
				arcDirection: workspaceState.arcDirection,
			});
		if (version !== renderVersion) {
			return;
		}

				const rendererKind = getRendererKindForMode(workspaceState.mode);
			if (renderer && getRendererKind(renderer) !== rendererKind) {
				unbindEvents?.();
				unbindEvents = undefined;
				stopForceLayoutSimulation();
				renderer.kill();
				renderer = undefined;
			}
			const firstRender = !renderer;
				if (renderer) {
					unbindEvents?.();
					stopForceLayoutSimulation();
					setRendererPalette(renderer, palette);
					setRendererManualLayout(renderer, workspaceState.manualLayout);
					renderer.setGraph(graph);
					unbindEvents = bindEventsForRenderer(renderer);
				} else {
					const nextRenderer = await createGraphRenderer({
						graph,
						container: canvas,
						palette,
						kind: rendererKind,
						manualLayout: workspaceState.manualLayout,
						fadeDistance: workspaceState.fadeDistance,
						labelSize: workspaceState.labelSize,
						labelPosition: workspaceState.labelPosition,
						labelColor: workspaceState.labelColor,
						labelBackgroundOpacity:
							workspaceState.labelBackgroundOpacity,
						labelDensity: workspaceState.labelDensity,
						cubeFaceOpacity: workspaceState.cubeFaceOpacity,
						enableForceLayout: workspaceState.enableForceLayout,
						forceLabels: workspaceState.forceLabels,
						isStale: () => version !== renderVersion,
					});
					if (!nextRenderer) {
						return;
					}
				if (version !== renderVersion) {
					nextRenderer.kill();
					return;
				}
				renderer = nextRenderer;
				unbindEvents = bindEventsForRenderer(nextRenderer);
			}
			syncRendererGroups();
			renderer.setSelected(workspaceState.selectedNodeId);
			renderer.setHovered(workspaceState.hoveredNodeId);
				if (
					getModeCapabilities(workspaceState.mode)
						.usesSigmaForceSimulation &&
					workspaceState.enableForceLayout &&
					!isForce3DRenderer(renderer) &&
					!isCube3DRenderer(renderer)
			) {
				getOrCreateForceLayoutSimulation(renderer).start();
			}
			if (firstRender || fitAfterRender) {
				renderer.fit();
			}
			controller.setRendererDebugState({
				status: "rendered",
				mode: workspaceState.mode,
				container: readContainerSize(),
				runtimeGraph: serializeRuntimeGraph(graph),
			});
		}

		function bindEventsForRenderer(targetRenderer: GraphRenderer): () => void {
			const capabilities = getModeCapabilities(workspaceState.mode);
			const baseCallbacks = {
				onSelect: (nodeId?: string) => controller.selectNode(nodeId),
				onHover: (nodeId?: string) => controller.hoverNode(nodeId),
				onOpen: (nodeId: string) => void controller.openNode(nodeId),
				onConnectionDrag: setGraphConnectionDrag,
				onConnect: connectVisibleNodes,
			};

			return bindRendererEvents(targetRenderer, {
				force3d: () => baseCallbacks,
				cube3d: (cubeRenderer) => ({
					...baseCallbacks,
					onNodeDrag: (nodeId, position) => {
						getLayoutSnapshot().positions.set(nodeId, position);
					},
					onNodeDragEnd: (nodeId) => {
						const position = getLayoutSnapshot().positions.get(nodeId);
						if (position) {
							controller.setManualNodePosition(
								nodeId,
								position,
								cubeRenderer.getNodeFace(nodeId),
							);
						}
					},
				}),
				sigma: (sigmaRenderer) => ({
					...baseCallbacks,
					enableForceLayout:
						capabilities.usesSigmaForceSimulation &&
						workspaceState.enableForceLayout,
					enableNodeDragging: capabilities.supportsFreeNodeDrag,
					onOpen: (nodeId) => {
						if (!shouldOpenNode(Date.now(), suppressNodeOpenUntil)) {
							return;
						}
						void controller.openNode(nodeId);
					},
					onNodeDrag: (nodeId, position) => {
						suppressNodeOpenUntil = getNextNodeOpenSuppressUntil(Date.now());
						sigmaRenderer.holdCurrentBounds();
						if (getSigmaDragAction(capabilities).kind === "manual-position") {
							sigmaRenderer.runtimeGraph.mergeNodeAttributes(nodeId, {
								x: position.x,
								y: position.y,
								fixed: true,
							});
						} else {
							getOrCreateForceLayoutSimulation(sigmaRenderer).drag(
								nodeId,
								position,
							);
						}
						getLayoutSnapshot().positions.set(nodeId, position);
						if (capabilities.supportsFreeNodeDrag) {
							const viewportPosition =
								sigmaRenderer.instance.graphToViewport(position);
							activeNodeDropGroupId =
								sigmaRenderer.getGroupAtViewportPosition(viewportPosition);
							sigmaRenderer.setActiveDropGroup(activeNodeDropGroupId);
						}
						sigmaRenderer.instance.refresh();
					},
					onNodeDragEnd: (nodeId) => {
						suppressNodeOpenUntil = getNextNodeOpenSuppressUntil(Date.now());
						if (
							getSigmaDragEndAction(capabilities).kind ===
							"commit-manual-position"
						) {
							const position = getLayoutSnapshot().positions.get(nodeId);
							if (position) {
								controller.setManualNodePosition(
									nodeId,
									position,
									activeNodeDropGroupId,
								);
							}
							sigmaRenderer.setActiveDropGroup(undefined);
							activeNodeDropGroupId = undefined;
							return;
						}
						forceLayoutSimulation?.release(nodeId);
					},
				}),
			});
		}

			function syncRendererGroups(): void {
				if (!renderer || isForce3DRenderer(renderer)) {
					return;
				}
				if (isCube3DRenderer(renderer)) {
					renderer.setManualLayout(workspaceState.manualLayout);
					return;
				}
			renderer.setGroups(
				getModeCapabilities(workspaceState.mode).supportsManualGroups
					? workspaceState.manualLayout.groups
					: [],
					{
						onMovePreview: moveRuntimeGroupNodes,
						onMoveCommit: (groupId, delta) =>
							controller.moveGroup(groupId, delta),
						onResizeCommit: (groupId, geometry) =>
							controller.resizeGroup(groupId, geometry),
						getGroupNodeIds: (groupId) =>
							getManualGroupNodeIds(
								workspaceState.manualLayout.nodes,
								groupId,
							),
					},
				);
			}

			function moveRuntimeGroupNodes(
				groupId: string,
				delta: { x: number; y: number },
			): void {
				if (
					!renderer ||
					isForce3DRenderer(renderer) ||
					isCube3DRenderer(renderer)
				) {
					return;
				}
				moveRuntimeManualGroupNodes(
					renderer.runtimeGraph,
					getLayoutSnapshot().positions,
					workspaceState.manualLayout.nodes,
					groupId,
					delta,
				);
				renderer.instance.refresh();
			}

		function getOrCreateForceLayoutSimulation(
		targetRenderer: SigmaRenderer,
	): D3ForceSimulation {
		if (!forceLayoutSimulation) {
			forceLayoutSimulation = new D3ForceSimulation(
					targetRenderer.runtimeGraph,
					targetRenderer,
					workspaceState.graphSpacing,
					getWorkspaceGraphForceSettings(workspaceState),
					(nodeId, position) => {
						getLayoutSnapshot().positions.set(nodeId, position);
					},
				);
			}
			return forceLayoutSimulation;
		}

		function stopForceLayoutSimulation(): void {
			forceLayoutSimulation?.stop();
			forceLayoutSimulation = undefined;
			renderer?.clearHeldBounds();
		}

		function snapshotCurrentGraphPositions(graph: RuntimeGraph): void {
		const positions = getLayoutSnapshot().positions;
		graph.forEachNode((nodeId, attributes) => {
			if (!attributes.isBend) {
				positions.set(nodeId, { x: attributes.x, y: attributes.y });
			}
		});
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
			const defaultColor =
				getComputedStyle(document.body)
					.getPropertyValue("--interactive-accent")
					.trim() || "#7c6ff0";
				return resolveNodeStyle(selectedNode, getActiveNodeStyleRules(workspaceState), {
					...getActiveDefaultNodeStyle(workspaceState, defaultColor),
				}).color;
		});
		const searchableNodes = $derived(workspaceState.projection?.nodes ?? []);
	const atNodeLimit = $derived(
		workspaceState.chartSource === "query" && workspaceState.projection
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
			const rules = getActiveNodeStyleRules(workspaceState);
		const defaultColor =
			getComputedStyle(document.body)
				.getPropertyValue("--interactive-accent")
				.trim() || "#7c6ff0";
		const colors = new Map<string, string>();
		for (const node of [...selectedDockNodes, ...dockNoteCandidates]) {
			if (!colors.has(node.path)) {
				colors.set(
						node.path,
						resolveNodeStyle(node, rules, {
							...getActiveDefaultNodeStyle(workspaceState, defaultColor),
						}).color,
					);
			}
		}
		return colors;
	});
	const dockNoteEntries = $derived.by(() => {
		const nodesByPath = new Map(
			debugSnapshot.index.nodes.map((n) => [n.path, n]),
		);
		return workspaceState.dock.notes.map((note) => {
			const node = nodesByPath.get(note.path);
			if (node) {
				return {
					id: node.id,
					path: node.path,
					title: node.title,
					broken: false,
					color: nodeColors.get(node.path),
				};
			}
			const name =
				note.path.split("/").pop()?.replace(/\.md$/u, "") ??
				note.path;
			return {
				id: note.id,
				path: note.path,
				title: name,
				broken: true,
			};
		});
	});
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

	function toggleDebug(): void {
		debugOpen = !debugOpen;
		if (!debugOpen) {
			window.requestAnimationFrame(() => renderer?.resize());
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
		window.requestAnimationFrame(() => renderer?.focusNode(nodeId));
	}

	function handleDockLinkPointerDown(
		payload: DockDragPayload,
		event: PointerEvent,
	): void {
		if (
			!canvas ||
			!renderer ||
			!(event.currentTarget instanceof HTMLElement)
		) {
			return;
		}
			const source = readElementCenterViewportPosition(
				canvas,
				event.currentTarget,
			);
			const point = readViewportPoint(event.clientX, event.clientY);
			dockDrag = payload;
			dockConnectionDrag = payload;
			connectionDrag = createDockConnectionDragState(payload, source, point);
		window.addEventListener("pointermove", handleDockLinkPointerMove, {
			capture: true,
		});
		window.addEventListener("pointerup", handleDockLinkPointerUp, {
			capture: true,
			once: true,
		});
	}

	function handleDockLinkPointerMove(event: PointerEvent): void {
		if (!connectionDrag || !dockConnectionDrag) {
			return;
		}
		event.preventDefault();
		const point = readViewportPoint(event.clientX, event.clientY);
		const targetNodeId = readNodeAtClientPosition(
			event.clientX,
			event.clientY,
			dockConnectionDrag,
		);
		setDockTarget(targetNodeId);
			connectionDrag = updateDockConnectionDragState(
				connectionDrag,
				point,
				targetNodeId,
			);
	}

	function handleDockLinkPointerUp(event: PointerEvent): void {
		if (!dockConnectionDrag) {
			return;
		}
		const payload = dockConnectionDrag;
		const targetNodeId =
			dockTargetNodeId ??
			readNodeAtClientPosition(event.clientX, event.clientY, payload);
		resetDockConnectionDrag();
		if (!targetNodeId) {
			return;
		}
			handleDockPayloadGraphAction(
				resolveDockPayloadGraphAction(payload, targetNodeId),
			);
		}

	function resetDockConnectionDrag(): void {
		window.removeEventListener("pointermove", handleDockLinkPointerMove, {
			capture: true,
		});
		window.removeEventListener("pointerup", handleDockLinkPointerUp, {
			capture: true,
		});
		connectionDrag = undefined;
		dockConnectionDrag = undefined;
		resetDockDrag();
	}

		function handleDockPayloadGraphAction(
			action: DockPayloadGraphAction,
		): void {
			if (action.kind === "create-from-template") {
				openCreateFromTemplateModal(
					action.payload,
					action.targetNodeId,
					action.direction,
				);
				return;
			}
			if (action.kind === "none") {
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
					status: "error",
					error: formatError(error),
				}),
			);
	}

	function resetDockDrag(): void {
		dockDrag = undefined;
		setDockTarget(undefined);
	}

	function readNodeAtClientPosition(
		clientX: number,
		clientY: number,
		payload: DockDragPayload,
	): string | undefined {
		if (!canvas || !renderer) {
			return undefined;
		}
		const point = readViewportPoint(clientX, clientY);
		const nodeId = renderer.getNodeAtViewportPosition({
			x: point.x,
			y: point.y,
		});
		if (!nodeId) {
			return undefined;
		}
			return canDockPayloadTargetNode(payload, nodeId) ? nodeId : undefined;
	}

		function readViewportPoint(
			clientX: number,
			clientY: number,
		): { x: number; y: number } {
			return readViewportPointFromContainer(canvas, clientX, clientY);
		}

		function setDockTarget(nodeId?: string): void {
		if (dockTargetNodeId === nodeId) {
			return;
		}
		dockTargetNodeId = nodeId;
		renderer?.setHovered(nodeId ?? workspaceState.hoveredNodeId);
	}

		function readElementAtMouseEvent(event: MouseEvent): Element | null {
			return readElementAtPoint(
				canvas.ownerDocument,
				event.clientX,
				event.clientY,
			);
		}

	function openCreateFromTemplateModal(
		payload: Extract<DockDragPayload, { kind: "template" }>,
		targetNodeId: string,
		direction: DockConnectionDirection,
	): void {
		openCreateFromTemplateId(
			payload.templateId,
			targetNodeId,
			payload.label,
			direction,
		);
	}

		async function openCreateFromTemplateId(
			templateId: string,
			targetNodeId: string,
			label = findTemplateLabel(templateId),
			direction: DockConnectionDirection = "from-dock-to-graph",
		): Promise<void> {
			if (!label) {
				return;
			}
			const filePath = await new Promise<string | undefined>(
				(resolve) => {
					new CreateFromTemplateModal(
						app,
						label,
						findNodeTitle(targetNodeId),
						async (name) => {
							const path =
								await controller.createNoteFromTemplate(
									templateId,
									targetNodeId,
									name,
									direction,
									workspaceState.activeConnectionField,
								);
							resolve(path);
						},
					).open();
				},
			);
			if (filePath) {
				controller.addCuratedFile(filePath);
			}
			if (filePath && openTemplateNoteInNewTab) {
				const file = app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					await app.workspace.getLeaf("tab").openFile(file);
				}
			}
		}

	function findTemplateLabel(templateId: string): string | undefined {
		return workspaceState.dock.templates.find(
			(template) => template.id === templateId,
		)?.label;
	}

		function findNodeTitle(nodeId: string): string {
			return (
				debugSnapshot.index.nodes.find((node) => node.id === nodeId)
					?.title ?? nodeId
			);
		}

		async function openMetadataLink(
			linkText: string,
			sourcePath: string,
		): Promise<void> {
			const target = app.metadataCache.getFirstLinkpathDest(
				extractLinkText(linkText),
				sourcePath,
			);
			if (target) {
				await app.workspace.getLeaf("tab").openFile(target);
			}
		}

		function isGraphOverlayTarget(target: EventTarget | null): boolean {
			if (!(target instanceof HTMLElement)) {
				return false;
			}
			return Boolean(
				target.closest(
					".knowledge-workspace-dock-panel, .knowledge-workspace-display-controls, .knowledge-workspace-inspector, .knowledge-workspace-connection-panel",
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
			if (!shouldHandleConnectionUndoShortcut({
				key: event.key,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				altKey: event.altKey,
				shiftKey: event.shiftKey,
				connectionUndoCount: workspaceState.connectionUndoCount,
				editableTarget: isEditableTarget(event.target),
			})) {
				return;
			}
		event.preventDefault();
		void controller.undoLastConnection().catch((error: unknown) =>
			controller.setRendererDebugState({
				status: "error",
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
		onFit={() => renderer?.fit()}
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
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="knowledge-workspace-settings-backdrop"
				onpointerdown={() => {
					settingsPanel = undefined;
				}}
				oncontextmenu={(e) => {
					e.preventDefault();
					settingsPanel = undefined;
				}}
			></div>
			<div
				class="knowledge-workspace-settings-popover"
				style:--knowledge-workspace-settings-left={`${settingsPopoverLeft}px`}
			>
					{#if settingsPanel === "groups"}
						<GroupPanel
							manualLayout={workspaceState.manualLayout}
							locked={workspaceState.mode === "cube"}
							onAddGroup={() => controller.addGroup()}
							onUpdateGroup={(groupId, patch) =>
								controller.updateGroup(groupId, patch)}
							onDeleteGroup={(groupId) => controller.deleteGroup(groupId)}
						/>
					{:else}
						<FilterPanel
								{app}
								panel={settingsPanel}
						mode={workspaceState.mode}
							fadeDistance={workspaceState.fadeDistance}
							labelSize={workspaceState.labelSize}
					labelPosition={workspaceState.labelPosition}
					labelColor={workspaceState.labelColor}
					labelBackgroundOpacity={workspaceState.labelBackgroundOpacity}
					labelDensity={workspaceState.labelDensity}
					cubeFaceOpacity={workspaceState.cubeFaceOpacity}
					forceLabels={workspaceState.forceLabels}
					enableForceLayout={workspaceState.enableForceLayout}
							flowEdgeStyle={workspaceState.flowEdgeStyle}
					flowDirection={workspaceState.flowDirection}
					arcDirection={workspaceState.arcDirection}
						graphSpacing={workspaceState.graphSpacing}
						graphCenterForce={workspaceState.graphCenterForce}
						graphRepelForce={workspaceState.graphRepelForce}
						graphLinkForce={workspaceState.graphLinkForce}
						graphDragLinkForce={workspaceState.graphDragLinkForce}
						graphReturnForce={workspaceState.graphReturnForce}
						graphLinkDistance={workspaceState.graphLinkDistance}
						flowSpacing={workspaceState.flowSpacing}
						arcSpacing={workspaceState.arcSpacing}
					query={workspaceState.query}
					globalQuery={workspaceState.globalQuery}
						folders={workspaceState.availableFolders}
							tags={workspaceState.availableTags}
								{metadataFieldSuggestions}
								{metadataFieldTypes}
								{metadataFieldValueSuggestions}
								{filePathSuggestions}
							defaultNodeStyle={workspaceState.defaultNodeStyle}
							defaultLinkStyle={workspaceState.defaultLinkStyle}
							globalNodeStyleRules={workspaceState.globalNodeStyleRules}
					nodeStyleOverrides={workspaceState.nodeStyleOverrides}
					nodeStyleRules={workspaceState.nodeStyleRules}
					globalLinkStyleRules={workspaceState.globalLinkStyleRules}
					linkStyleOverrides={workspaceState.linkStyleOverrides}
					linkStyleRules={workspaceState.linkStyleRules}
					onFlowEdgeStyle={(style) =>
						controller.setFlowEdgeStyle(style)}
					onFlowDirection={(direction) =>
						controller.setFlowDirection(direction)}
					onArcDirection={(direction) =>
						controller.setArcDirection(direction)}
						onFadeDistance={(value) =>
							controller.setFadeDistance(value)}
							onLabelSize={(value) => controller.setLabelSize(value)}
							onLabelPosition={(position) =>
								controller.setLabelPosition(position)}
							onLabelColor={(color) => controller.setLabelColor(color)}
					onLabelBackgroundOpacity={(value) =>
						controller.setLabelBackgroundOpacity(value)}
					onLabelDensity={(value) => controller.setLabelDensity(value)}
					onCubeFaceOpacity={(value) =>
						controller.setCubeFaceOpacity(value)}
					onForceLabels={(value) => controller.setForceLabels(value)}
					onEnableForceLayout={(value) =>
						controller.setEnableForceLayout(value)}
							onGraphSpacing={(spacing) =>
								controller.setGraphSpacing(spacing)}
							onGraphCenterForce={(value) =>
								controller.setGraphCenterForce(value)}
							onGraphRepelForce={(value) =>
								controller.setGraphRepelForce(value)}
							onGraphLinkForce={(value) =>
								controller.setGraphLinkForce(value)}
							onGraphDragLinkForce={(value) =>
								controller.setGraphDragLinkForce(value)}
							onGraphReturnForce={(value) =>
								controller.setGraphReturnForce(value)}
							onGraphLinkDistance={(value) =>
								controller.setGraphLinkDistance(value)}
							onFlowSpacing={(spacing) =>
								controller.setFlowSpacing(spacing)}
					onArcSpacing={(spacing) =>
						controller.setArcSpacing(spacing)}
					onChange={(patch) => controller.updateQuery(patch)}
					onGlobalChange={(patch) =>
						controller.updateGlobalQuery(patch)}
					onDefaultNodeStyle={(style) =>
						controller.setDefaultNodeStyle(style)}
					onDefaultLinkStyle={(style) =>
						controller.setDefaultLinkStyle(style)}
					onGlobalNodeStyleRulesChange={(rules) =>
						controller.setGlobalNodeStyleRules(rules)}
					onNodeStyleOverrides={(style) =>
						controller.setNodeStyleOverrides(style)}
					onNodeStyleRulesChange={(rules) =>
						controller.setNodeStyleRules(rules)}
					onGlobalLinkStyleRulesChange={(rules) =>
						controller.setGlobalLinkStyleRules(rules)}
					onLinkStyleOverrides={(style) =>
						controller.setLinkStyleOverrides(style)}
							onLinkStyleRulesChange={(rules) =>
								controller.setLinkStyleRules(rules)}
						/>
					{/if}
				</div>
		{/if}
		<main
			class="knowledge-workspace-main"
			class:dock-node-dragging={Boolean(dockDrag)}
			class:connection-collapsed={!connectionOpen}
			class:curated-panel-visible={workspaceState.chartSource === "curated"}
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
					{#if workspaceState.chartSource === "curated"}
				<CuratedPanel
					{app}
					curated={workspaceState.curated}
					nodes={debugSnapshot.index.nodes}
					groups={workspaceState.manualLayout.groups}
					manualLayout={workspaceState.manualLayout}
					groupRequired={workspaceState.mode === "cube"}
					folders={workspaceState.availableFolders}
					{nodeColors}
					{workspaceFilePath}
					panelOpen={curatedPanelOpen}
					onTogglePanel={() => (curatedPanelOpen = !curatedPanelOpen)}
					panelWidth={workspaceState.dock.curatedPanelWidth}
					onResizePanel={(w: number) =>
						controller.setCuratedPanelWidth(w)}
					focusOnSelect={workspaceState.dock.focusOnSelect}
					onToggleFocusOnSelect={() =>
						controller.setDockFocusOnSelect(
							!workspaceState.dock.focusOnSelect,
						)}
					dropTarget={graphConnectionTargetCurated}
					onAddFile={(path, groupId) =>
						controller.addCuratedFile(path, groupId)}
					onAddFiles={(paths, groupId) =>
						controller.addCuratedFiles(paths, groupId)}
					onRemoveFile={(path) => controller.removeCuratedFile(path)}
					onRemoveFiles={(paths) =>
						controller.removeCuratedFiles(paths)}
					onMoveFilesToGroup={(paths, groupId) =>
						controller.moveCuratedFilesToGroup(paths, groupId)}
					onClearFiles={() => controller.clearCuratedFiles()}
					onReorderFile={(path, targetPath, placement) =>
						controller.reorderCuratedFile(
							path,
							targetPath,
							placement,
						)}
					onOpenNote={(path) => void controller.openNode(path)}
					onSelectNote={(path) => {
						controller.selectNode(path);
						if (workspaceState.dock.focusOnSelect) {
							window.requestAnimationFrame(() =>
								renderer?.focusNode(path),
							);
						}
					}}
				/>
			{/if}
			{#if connectionDrag}
				<svg
					class="knowledge-workspace-connection-preview"
					aria-hidden="true"
				>
					<line
						class:target={Boolean(
							connectionDrag.targetNodeId ||
								graphConnectionTargetNotePath ||
								graphConnectionTargetTemplateId ||
								graphConnectionTargetCurated,
						)}
						x1={connectionDrag.x1}
						y1={connectionDrag.y1}
						x2={connectionDrag.x2}
						y2={connectionDrag.y2}
					/>
				</svg>
			{/if}
			{#if workspaceState.projection?.nodes.length === 0}
				<div class="knowledge-workspace-empty">
					No matching metadata relationships.
				</div>
			{/if}
			<DockGraphPanel
				{app}
					templates={workspaceState.dock.templates}
					notes={dockNoteEntries}
					availableNotes={dockNoteCandidates}
					groups={workspaceState.manualLayout.groups}
					{nodeColors}
				{dockOpen}
				onToggleDock={() => (dockOpen = !dockOpen)}
				dockWidth={workspaceState.dock.dockWidth}
				onResizeDock={(w: number) => controller.setDockWidth(w)}
				activeConnectionField={workspaceState.activeConnectionField}
				draggingKey={dockDrag
					? dockDrag.kind === "template"
						? `template:${dockDrag.templateId}`
						: `note:${dockDrag.notePath}`
					: undefined}
				linking={Boolean(dockConnectionDrag)}
				targetNodeId={dockTargetNodeId}
				graphTargetNotePath={graphConnectionTargetNotePath}
				graphTargetTemplateId={graphConnectionTargetTemplateId}
				onAddTemplate={(template) =>
					controller.addDockTemplate(template)}
				onUpdateTemplate={(templateId, template) =>
					controller.updateDockTemplate(templateId, template)}
				onRemoveTemplate={(templateId) =>
					controller.removeDockTemplate(templateId)}
				onAddNote={(path) => controller.addDockNote(path)}
				onRemoveNote={(path) => controller.removeDockNote(path)}
				onReorderTemplate={(templateId, targetTemplateId, placement) =>
					controller.reorderDockTemplate(
						templateId,
						targetTemplateId,
						placement,
					)}
				onReorderNote={(path, targetPath, placement) =>
					controller.reorderDockNote(path, targetPath, placement)}
				onLinkPointerDown={handleDockLinkPointerDown}
				onOpenNote={(nodeId) => void controller.openNode(nodeId)}
				focusOnSelect={workspaceState.dock.focusOnSelect}
				onToggleFocusOnSelect={() =>
					controller.setDockFocusOnSelect(
						!workspaceState.dock.focusOnSelect,
					)}
				onSelectNote={(nodeId) => {
					controller.selectNode(nodeId);
					if (workspaceState.dock.focusOnSelect) {
						window.requestAnimationFrame(() =>
							renderer?.focusNode(nodeId),
						);
					}
				}}
			/>
			<Inspector
				{app}
				node={selectedNode}
				nodes={searchableNodes}
				nodeColor={selectedNodeColor}
				mode={workspaceState.mode}
				manualLayout={workspaceState.manualLayout}
				activeConnectionField={workspaceState.activeConnectionField}
				onOpenNote={(path) => void controller.openNode(path)}
				onOpenMetadataLink={(linkText, sourcePath) =>
					void openMetadataLink(linkText, sourcePath)}
				onSetNodeGroup={(path, groupId) =>
					controller.setNodeGroup(path, groupId)}
				onConnectNode={(sourcePath, targetPath, field) => {
					void controller
						.connectNodes(sourcePath, targetPath, field)
						.catch((error: unknown) =>
							controller.setRendererDebugState({
								status: "error",
								error: formatError(error),
							}),
						);
				}}
			/>
			{#if atNodeLimit}
				<section class="knowledge-workspace-notice">
					<span>Node limit ({workspaceState.query.maxNodes}) reached. Some notes may be hidden.</span>
				</section>
			{/if}
			<ConnectionPanel
				{app}
				fields={workspaceState.connectionFieldSpecs}
				{metadataFieldSuggestions}
				activeFieldSpecId={workspaceState.activeConnectionFieldSpecId}
				activeField={workspaceState.activeConnectionField}
				dragging={Boolean(connectionDrag)}
				dragTarget={connectionDrag?.targetNodeId}
				undoCount={workspaceState.connectionUndoCount}
				collapsed={!connectionOpen}
				onToggle={() => (connectionOpen = !connectionOpen)}
				onSelectField={(field, mode) => {
					if (mode) {
						controller.setConnectionFieldMode(field, mode);
					}
					controller.setActiveConnectionField(field);
				}}
				onFieldMode={(field, mode) =>
					controller.setConnectionFieldMode(field, mode)}
				onAddField={(field) => controller.addConnectionField(field)}
				onRemoveField={(field) =>
					controller.removeConnectionField(field)}
				onReorderField={(id, targetId, placement) =>
					controller.reorderConnectionField(id, targetId, placement)}
				onUndo={() =>
					void controller
						.undoLastConnection()
						.catch((error: unknown) =>
							controller.setRendererDebugState({
								status: "error",
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
