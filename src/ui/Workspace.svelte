<script lang="ts">
	import { type App } from "obsidian";
	import { onMount } from "svelte";
	import type {
		DebugSnapshot,
		DockConnectionDirection,
		MetaGraphDocument,
		SettingsPanelMode,
		WorkspaceState,
	} from "../core/types";
	import {
		bindGraphEvents,
		type ConnectionDragState,
	} from "../graph/graph-events";
	import {
		GraphologyAdapter,
		type GraphPosition,
		type RuntimeGraph,
	} from "../graph/graphology-adapter";
	import { readGraphPalette } from "../graph/graph-styles";
	import { resolveNodeStyle, type NodeStyle } from "../graph/style-rules";
	import { SigmaRenderer } from "../graph/sigma-renderer";
	import { ArcLayout } from "../layouts/arc-layout";
	import {
		applyOrthogonalFlowEdges,
		ElkFlowLayout,
		type OrthogonalRouteMap,
	} from "../layouts/elk-flow-layout";
	import { ForceAtlasLayout } from "../layouts/force-layout";
	import type { WorkspaceController } from "../workspace/workspace-controller";
	import { serializeMetaGraphState } from "../workspace/meta-graph-model";
	import FilterPanel from "./FilterPanel.svelte";
	import DebugPanel from "./DebugPanel.svelte";
	import DockGraphPanel, {
		type DockDragPayload,
	} from "./DockGraphPanel.svelte";

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
	let lastAutoSavedState = "";
	let lastProjection: WorkspaceState["projection"];
	let lastActiveChartId: string | undefined;
	let lastMode: WorkspaceState["mode"] | undefined;
	let lastFlowEdgeStyle: WorkspaceState["flowEdgeStyle"] | undefined;
	let lastFlowDirection: WorkspaceState["flowDirection"] | undefined;
	let lastArcDirection: WorkspaceState["arcDirection"] | undefined;
	let lastLayoutRevision: number | undefined;
	let lastGlobalNodeStyleRules:
		| WorkspaceState["globalNodeStyleRules"]
		| undefined;
	let lastGlobalLinkStyleRules:
		| WorkspaceState["globalLinkStyleRules"]
		| undefined;
	let lastNodeStyleRules: WorkspaceState["nodeStyleRules"] | undefined;
	let lastLinkStyleRules: WorkspaceState["linkStyleRules"] | undefined;
	let debugOpen = $state(false);
	let settingsPanel = $state<SettingsPanelMode | undefined>(undefined);
	let settingsPopoverLeft = $state(0);
	let connectionDrag = $state<ConnectionDragState | undefined>(undefined);
	let graphConnectionTargetNotePath = $state<string | undefined>(undefined);
	let graphConnectionTargetTemplateId = $state<string | undefined>(undefined);
	let dockDrag = $state<DockDragPayload | undefined>(undefined);
	let dockConnectionDrag = $state<DockDragPayload | undefined>(undefined);
	let dockTargetNodeId = $state<string | undefined>(undefined);
	let dockOpen = $state(true);
	let connectionOpen = $state(true);

	interface LayoutSnapshot {
		positions: Map<string, GraphPosition>;
		edgeIds: Set<string>;
		orthogonalRoutes: OrthogonalRouteMap;
	}
	const layoutSnapshots = new Map<string, LayoutSnapshot>();
	const handleGraphConnectionMouseMove = (event: MouseEvent): void => {
		if (!connectionDrag || dockConnectionDrag) {
			return;
		}
		const target = readElementAtMouseEvent(event);
		graphConnectionTargetNotePath = readDockNotePathFromTarget(target);
		graphConnectionTargetTemplateId = readDockTemplateIdFromTarget(target);
	};
	const handleGraphConnectionMouseUp = (event: MouseEvent): void => {
		if (!connectionDrag || dockConnectionDrag) {
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
			openCreateFromTemplateId(
				templateId,
				sourceNodeId,
				undefined,
				"from-graph-to-dock",
			);
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
					status: "error",
					error: formatError(error),
				}),
			);
	};

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
				nextState.globalNodeStyleRules !== lastGlobalNodeStyleRules ||
				nextState.globalLinkStyleRules !== lastGlobalLinkStyleRules ||
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
				lastGlobalNodeStyleRules = nextState.globalNodeStyleRules;
				lastGlobalLinkStyleRules = nextState.globalLinkStyleRules;
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
			window.clearTimeout(autoSaveTimer);
			if (pendingAutoSave) {
				void onAutoSave(pendingAutoSave);
				pendingAutoSave = undefined;
			}
			unsubscribe();
			resizeObserver.disconnect();
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
			resetDockConnectionDrag();
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
		const positions = layoutSnapshot.positions;
		const graph = new GraphologyAdapter(
			palette,
			getActiveNodeStyleRules(),
			getActiveLinkStyleRules(),
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
		await applyStableLayout(graph, layoutSnapshot, newNodeIds, forceLayout);
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
								status: "error",
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
			status: "rendered",
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
const atNodeLimit = $derived(
	workspaceState.projection
		? workspaceState.projection.nodes.length >= workspaceState.query.maxNodes
		: false,
);
	const debugSnapshot: DebugSnapshot = $derived(
		controller.getDebugSnapshot(workspaceState),
	);
	const selectedDockNodes = $derived(getSelectedDockNodes(debugSnapshot));
	const dockNoteCandidates = $derived(getDockNoteCandidates(debugSnapshot));
	const nodeColors = $derived.by(() => {
		const rules = getActiveNodeStyleRules();
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
						color: defaultColor,
						size: 7,
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
		getMetadataFieldSuggestions(debugSnapshot),
	);

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
		return new Promise((resolve) =>
			window.requestAnimationFrame(() => resolve()),
		);
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
			workspaceState.mode === "flow" &&
			!setsEqual(currentEdgeIds, snapshot.edgeIds);
		const needsFlowLayout = forceLayout || firstLayout;
		const needsGraphLayout = forceLayout || firstLayout;

		if (workspaceState.mode === "arc") {
			await new ArcLayout(
				workspaceState.arcSpacing,
				workspaceState.arcDirection,
			).apply(graph);
			snapshot.edgeIds = currentEdgeIds;
			snapshot.orthogonalRoutes = new Map();
		} else if (workspaceState.mode === "flow") {
			if (needsFlowLayout) {
				const layout = new ElkFlowLayout(
					workspaceState.flowEdgeStyle,
					workspaceState.flowDirection,
					workspaceState.flowSpacing,
				);
				await layout.apply(graph);
				snapshot.edgeIds = currentEdgeIds;
				snapshot.orthogonalRoutes =
					workspaceState.flowEdgeStyle === "orthogonal"
						? layout.getOrthogonalRoutes()
						: new Map();
			} else {
				placeNewFlowNodes(graph, positions, newNodeIds);
				if (workspaceState.flowEdgeStyle === "orthogonal") {
					applyOrthogonalFlowEdges(graph, snapshot.orthogonalRoutes);
				}
			}
			if (flowEdgesChanged) {
				snapshot.edgeIds = currentEdgeIds;
			}
		} else {
			if (needsGraphLayout) {
				await new ForceAtlasLayout(workspaceState.graphSpacing).apply(
					graph,
				);
			}
		}

		graph.forEachNode((nodeId, attributes) => {
			if (!attributes.isBend) {
				positions.set(nodeId, { x: attributes.x, y: attributes.y });
			}
			graph.setNodeAttribute(nodeId, "fixed", false);
		});
	}

	function placeNewFlowNodes(
		graph: RuntimeGraph,
		positions: ReadonlyMap<string, GraphPosition>,
		newNodeIds: string[],
	): void {
		if (newNodeIds.length === 0) {
			return;
		}
		const occupied = new Map<string, GraphPosition>(
			[...positions.entries()].filter(([nodeId]) =>
				graph.hasNode(nodeId),
			),
		);
		for (const nodeId of newNodeIds) {
			const placement = findFlowInsertionPlacement(
				graph,
				occupied,
				nodeId,
			);
			if (!placement) {
				continue;
			}
			graph.mergeNodeAttributes(nodeId, {
				x: placement.x,
				y: placement.y,
				fixed: true,
			});
			occupied.set(nodeId, placement);
		}
	}

	function findFlowInsertionPlacement(
		graph: RuntimeGraph,
		occupied: ReadonlyMap<string, GraphPosition>,
		nodeId: string,
	): GraphPosition | undefined {
		for (const edge of graph.edges()) {
			const source = graph.source(edge);
			const target = graph.target(edge);
			const anchorId =
				source === nodeId && occupied.has(target)
					? target
					: target === nodeId && occupied.has(source)
						? source
						: undefined;
			if (!anchorId) {
				continue;
			}
			const anchor = occupied.get(anchorId);
			if (!anchor) {
				continue;
			}
			const newNodeIsAfterAnchor =
				source === anchorId && target === nodeId;
			return findOpenFlowSlot(anchor, newNodeIsAfterAnchor, occupied);
		}
		return undefined;
	}

	function findOpenFlowSlot(
		anchor: GraphPosition,
		newNodeIsAfterAnchor: boolean,
		occupied: ReadonlyMap<string, GraphPosition>,
	): GraphPosition {
		const direction = getFlowInsertionDirection(newNodeIsAfterAnchor);
		const layerDistance = 220 * workspaceState.flowSpacing;
		const crossStep = 90 * workspaceState.flowSpacing;
		const attempts = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
		for (const attempt of attempts) {
			const candidate = {
				x:
					anchor.x +
					direction.x * layerDistance +
					direction.crossX * crossStep * attempt,
				y:
					anchor.y +
					direction.y * layerDistance +
					direction.crossY * crossStep * attempt,
			};
			if (!flowSlotCollides(candidate, occupied)) {
				return candidate;
			}
		}
		const fallbackOffset = crossStep * (attempts.length + 1);
		return {
			x:
				anchor.x +
				direction.x * layerDistance +
				direction.crossX * fallbackOffset,
			y:
				anchor.y +
				direction.y * layerDistance +
				direction.crossY * fallbackOffset,
		};
	}

	function getFlowInsertionDirection(newNodeIsAfterAnchor: boolean): {
		x: number;
		y: number;
		crossX: number;
		crossY: number;
	} {
		const forward =
			workspaceState.flowDirection === "RL" ||
			workspaceState.flowDirection === "DT"
				? -1
				: 1;
		const sign = newNodeIsAfterAnchor ? forward : -forward;
		if (
			workspaceState.flowDirection === "LR" ||
			workspaceState.flowDirection === "RL"
		) {
			return { x: sign, y: 0, crossX: 0, crossY: 1 };
		}
		return { x: 0, y: sign, crossX: 1, crossY: 0 };
	}

	function flowSlotCollides(
		candidate: GraphPosition,
		occupied: ReadonlyMap<string, GraphPosition>,
	): boolean {
		for (const position of occupied.values()) {
			if (
				Math.abs(position.x - candidate.x) < 150 &&
				Math.abs(position.y - candidate.y) < 80
			) {
				return true;
			}
		}
		return false;
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
		if (workspaceState.mode === "graph") {
			return `${workspaceState.activeChartId}-graph`;
		}
		if (workspaceState.mode === "arc") {
			return `${workspaceState.activeChartId}-arc-${workspaceState.arcDirection}`;
		}
		return `${workspaceState.activeChartId}-flow-${workspaceState.flowEdgeStyle}-${workspaceState.flowDirection}`;
	}

	function getLogicalEdgeIds(graph: RuntimeGraph): Set<string> {
		return new Set(
			graph
				.edges()
				.filter((edge) => !graph.getEdgeAttribute(edge, "hidden")),
		);
	}

	function getActiveLinkStyleRules() {
		return [
			...workspaceState.linkStyleRules.filter(
				(rule) => rule.id === "all",
			),
			...workspaceState.globalLinkStyleRules,
			...workspaceState.linkStyleRules.filter(
				(rule) => rule.id !== "all",
			),
		];
	}

	function getActiveNodeStyleRules() {
		return [
			...workspaceState.nodeStyleRules.filter(
				(rule) => rule.id === "all",
			),
			...workspaceState.globalNodeStyleRules,
			...workspaceState.nodeStyleRules.filter(
				(rule) => rule.id !== "all",
			),
		];
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
			? `${error.name}: ${error.message}\n${error.stack ?? ""}`
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
		const nodesByPath = new Map(
			snapshot.index.nodes.map((node) => [node.path, node]),
		);
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
					sensitivity: "base",
				}),
			);
	}

	function getMetadataFieldSuggestions(snapshot: DebugSnapshot): string[] {
		return [
			...new Set(
				snapshot.index.nodes.flatMap(
					(node) => node.metadataFields ?? [],
				),
			),
		].sort((first, second) =>
			first.localeCompare(second, undefined, { sensitivity: "base" }),
		);
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
		const source = readDockElementViewportPosition(event.currentTarget);
		const point = readViewportPoint(event.clientX, event.clientY);
		dockDrag = payload;
		dockConnectionDrag = payload;
		connectionDrag = {
			sourceNodeId: dragKey(payload),
			x1: source.x,
			y1: source.y,
			x2: point.x,
			y2: point.y,
		};
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
		connectionDrag = {
			...connectionDrag,
			targetNodeId,
			x2: point.x,
			y2: point.y,
		};
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
		connectDockPayloadToGraph(payload, targetNodeId);
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

	function connectDockPayloadToGraph(
		payload: DockDragPayload,
		targetNodeId: string,
	): void {
		if (payload.kind === "template") {
			openCreateFromTemplateModal(
				payload,
				targetNodeId,
				"from-dock-to-graph",
			);
			return;
		}
		if (payload.kind === "broken-note") {
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
		return payload.kind === "note" && payload.notePath === nodeId
			? undefined
			: nodeId;
	}

	function readViewportPoint(
		clientX: number,
		clientY: number,
	): { x: number; y: number } {
		const rect = canvas.getBoundingClientRect();
		return {
			x: clientX - rect.left,
			y: clientY - rect.top,
		};
	}

	function readDockElementViewportPosition(element: HTMLElement): {
		x: number;
		y: number;
	} {
		const elementRect = element.getBoundingClientRect();
		return readViewportPoint(
			elementRect.left + elementRect.width / 2,
			elementRect.top + elementRect.height / 2,
		);
	}

	function dragKey(payload: DockDragPayload): string {
		return payload.kind === "template"
			? `template:${payload.templateId}`
			: `note:${payload.notePath}`;
	}

	function setDockTarget(nodeId?: string): void {
		if (dockTargetNodeId === nodeId) {
			return;
		}
		dockTargetNodeId = nodeId;
		renderer?.setHovered(nodeId ?? workspaceState.hoveredNodeId);
	}

	function readElementAtMouseEvent(event: MouseEvent): Element | null {
		return document.elementFromPoint(event.clientX, event.clientY);
	}

	function readDockNotePathFromTarget(
		target: EventTarget | null,
	): string | undefined {
		if (!(target instanceof HTMLElement)) {
			return undefined;
		}
		const noteEl = target.closest<HTMLElement>("[data-dock-note-path]");
		return noteEl?.dataset.dockNotePath || undefined;
	}

	function readDockTemplateIdFromTarget(
		target: EventTarget | null,
	): string | undefined {
		if (!(target instanceof HTMLElement)) {
			return undefined;
		}
		const templateEl = target.closest<HTMLElement>(
			"[data-dock-template-id]",
		);
		return templateEl?.dataset.dockTemplateId || undefined;
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

	function openCreateFromTemplateId(
		templateId: string,
		targetNodeId: string,
		label = findTemplateLabel(templateId),
		direction: DockConnectionDirection = "from-dock-to-graph",
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
					direction,
					workspaceState.activeConnectionField,
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
			debugSnapshot.index.nodes.find((node) => node.id === nodeId)
				?.title ?? nodeId
		);
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
		if (
			!(event.ctrlKey || event.metaKey) ||
			event.altKey ||
			event.shiftKey ||
			event.key.toLocaleLowerCase() !== "z" ||
			workspaceState.connectionUndoCount === 0 ||
			isEditableTarget(event.target)
		) {
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
		charts={workspaceState.charts}
		activeChartId={workspaceState.activeChartId}
		searchNodes={searchableNodes}
		onSelectChart={(id) => controller.setActiveChart(id)}
		onAddChart={() => controller.addChart()}
		onRenameChart={(name) => controller.setActiveChartName(name)}
		onChartType={(mode) => controller.setActiveChartType(mode)}
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
				<FilterPanel
					{app}
					panel={settingsPanel}
					mode={workspaceState.mode}
					fadeDistance={workspaceState.fadeDistance}
					flowEdgeStyle={workspaceState.flowEdgeStyle}
					flowDirection={workspaceState.flowDirection}
					arcDirection={workspaceState.arcDirection}
					graphSpacing={workspaceState.graphSpacing}
					flowSpacing={workspaceState.flowSpacing}
					arcSpacing={workspaceState.arcSpacing}
					query={workspaceState.query}
					globalQuery={workspaceState.globalQuery}
					folders={workspaceState.availableFolders}
					tags={workspaceState.availableTags}
					{metadataFieldSuggestions}
					globalNodeStyleRules={workspaceState.globalNodeStyleRules}
					nodeStyleRules={workspaceState.nodeStyleRules}
					globalLinkStyleRules={workspaceState.globalLinkStyleRules}
					linkStyleRules={workspaceState.linkStyleRules}
					onFlowEdgeStyle={(style) =>
						controller.setFlowEdgeStyle(style)}
					onFlowDirection={(direction) =>
						controller.setFlowDirection(direction)}
					onArcDirection={(direction) =>
						controller.setArcDirection(direction)}
					onFadeDistance={(value) =>
						controller.setFadeDistance(value)}
					onGraphSpacing={(spacing) =>
						controller.setGraphSpacing(spacing)}
					onFlowSpacing={(spacing) =>
						controller.setFlowSpacing(spacing)}
					onArcSpacing={(spacing) =>
						controller.setArcSpacing(spacing)}
					onChange={(patch) => controller.updateQuery(patch)}
					onGlobalChange={(patch) =>
						controller.updateGlobalQuery(patch)}
					onGlobalNodeStyleRulesChange={(rules) =>
						controller.setGlobalNodeStyleRules(rules)}
					onNodeStyleRulesChange={(rules) =>
						controller.setNodeStyleRules(rules)}
					onGlobalLinkStyleRulesChange={(rules) =>
						controller.setGlobalLinkStyleRules(rules)}
					onLinkStyleRulesChange={(rules) =>
						controller.setLinkStyleRules(rules)}
				/>
			</div>
		{/if}
		<main
			class="knowledge-workspace-main"
			class:dock-node-dragging={Boolean(dockDrag)}
			class:connection-collapsed={!connectionOpen}
			style="--dock-panel-width: {dockOpen ? `${workspaceState.dock.dockWidth}px` : '32px'}"
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
			<Inspector node={selectedNode} />
			{#if atNodeLimit}
				<section class="knowledge-workspace-notice">
					<span>Node limit ({workspaceState.query.maxNodes}) reached. Some notes may be hidden.</span>
				</section>
			{/if}
			<ConnectionPanel
				{app}
				fields={workspaceState.connectionFields}
				{metadataFieldSuggestions}
				activeField={workspaceState.activeConnectionField}
				dragging={Boolean(connectionDrag)}
				dragTarget={connectionDrag?.targetNodeId}
				undoCount={workspaceState.connectionUndoCount}
				collapsed={!connectionOpen}
				onToggle={() => (connectionOpen = !connectionOpen)}
				onSelectField={(field) =>
					controller.setActiveConnectionField(field)}
				onAddField={(field) => controller.addConnectionField(field)}
				onRemoveField={(field) =>
					controller.removeConnectionField(field)}
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
