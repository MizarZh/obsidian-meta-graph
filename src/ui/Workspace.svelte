<script lang="ts">
	import { TFile, type App } from "obsidian";
	import { onMount } from "svelte";
	import type {
		DebugSnapshot,
		DefaultLinkStyle,
		DefaultNodeStyle,
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
			bindForce3DEvents,
			Force3DRenderer,
		} from "../graph/force-3d-renderer";
		import {
			bindCube3DEvents,
			Cube3DRenderer,
		} from "../graph/cube-3d-renderer";
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
	import { HierarchicalEdgeBundlingLayout } from "../layouts/hierarchical-edge-bundling-layout";
	import { D3ForceSimulation } from "../layouts/d3-force-simulation";
	import { ForceAtlasLayout } from "../layouts/force-layout";
	import { extractLinkText } from "../core/link-resolver";
	import type { WorkspaceController } from "../workspace/workspace-controller";
	import { serializeMetaGraphState } from "../workspace/meta-graph-model";
	import CuratedPanel from "./CuratedPanel.svelte";
	import FilterPanel from "./FilterPanel.svelte";
	import GroupPanel from "./GroupPanel.svelte";
	import DebugPanel from "./DebugPanel.svelte";
	import DockGraphPanel, {
		type DockDragPayload,
	} from "./DockGraphPanel.svelte";
	import {
		getMetadataFieldSuggestions,
		getMetadataFieldTypes,
		getMetadataFieldValueSuggestions,
	} from "./filter-config";

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
		type GraphRenderer = SigmaRenderer | Force3DRenderer | Cube3DRenderer;
	let renderer: GraphRenderer | undefined;
	let unbindEvents: (() => void) | undefined;
	let renderVersion = 0;
	let autoSaveTimer: number | undefined;
	let pendingAutoSave: MetaGraphDocument | undefined;
	let lastAutoSavedState = "";
		let lastThemeSignature = "";
		let lastCanvasWidth = 0;
		let lastCanvasHeight = 0;
		let lastProjection: WorkspaceState["projection"];
	let lastActiveChartId: string | undefined;
	let lastMode: WorkspaceState["mode"] | undefined;
	let lastChartSource: WorkspaceState["chartSource"] | undefined;
	let lastFlowEdgeStyle: WorkspaceState["flowEdgeStyle"] | undefined;
	let lastFlowDirection: WorkspaceState["flowDirection"] | undefined;
		let lastArcDirection: WorkspaceState["arcDirection"] | undefined;
		let lastManualLayout: WorkspaceState["manualLayout"] | undefined;
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
		graphConnectionTargetCurated = readCuratedDropTarget(target);
	};
	const handleGraphConnectionMouseUp = (event: MouseEvent): void => {
		if (!connectionDrag || dockConnectionDrag) {
			return;
		}
		const target = readElementAtMouseEvent(event);
		if (readCuratedDropTarget(target)) {
			const sourceNodeId = connectionDrag.sourceNodeId;
			graphConnectionTargetNotePath = undefined;
			graphConnectionTargetTemplateId = undefined;
			graphConnectionTargetCurated = false;
			controller.addCuratedFile(sourceNodeId);
			return;
		}
		const templateId =
			graphConnectionTargetTemplateId ??
			readDockTemplateIdFromTarget(target);
		if (templateId) {
			const sourceNodeId = connectionDrag.sourceNodeId;
			graphConnectionTargetNotePath = undefined;
			graphConnectionTargetTemplateId = undefined;
			graphConnectionTargetCurated = false;
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
		graphConnectionTargetCurated = false;
		void controller
			.connectNodes(
				sourceNodeId,
				notePath,
				workspaceState.activeConnectionField,
			)
			.then(() => {
				controller.addCuratedFile(notePath);
			})
		.catch((error: unknown) =>
			controller.setRendererDebugState({
				status: "error",
				error: formatError(error),
			}),
		);
	};
	const handleGraphConnectionPointerMove = (event: PointerEvent): void => {
		handleGraphConnectionMouseMove(event);
	};
	const handleGraphConnectionPointerUp = (event: PointerEvent): void => {
		handleGraphConnectionMouseUp(event);
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
			const activeChartChanged =
				lastActiveChartId !== undefined &&
				nextState.activeChartId !== lastActiveChartId;
			const modeChanged =
				lastMode !== undefined && nextState.mode !== lastMode;
			const chartSourceChanged =
				lastChartSource !== undefined &&
				nextState.chartSource !== lastChartSource;
			const flowStyleChanged =
				lastFlowEdgeStyle !== undefined &&
				nextState.flowEdgeStyle !== lastFlowEdgeStyle;
			const flowDirectionChanged =
				lastFlowDirection !== undefined &&
				nextState.flowDirection !== lastFlowDirection;
				const arcDirectionChanged =
					lastArcDirection !== undefined &&
					nextState.arcDirection !== lastArcDirection;
				const manualLayoutChanged =
					lastManualLayout !== undefined &&
					nextState.manualLayout !== lastManualLayout;
			const layoutRevisionChanged =
				lastLayoutRevision !== undefined &&
				nextState.layoutRevision !== lastLayoutRevision;
			const styleRulesChanged =
				nextState.globalNodeStyleRules !== lastGlobalNodeStyleRules ||
				nextState.globalLinkStyleRules !== lastGlobalLinkStyleRules ||
				nextState.nodeStyleRules !== lastNodeStyleRules ||
				nextState.linkStyleRules !== lastLinkStyleRules;
				const fadeDistanceChanged =
					nextState.fadeDistance !== workspaceState.fadeDistance;
				const labelSizeChanged =
					nextState.labelSize !== workspaceState.labelSize;
				const labelPositionChanged =
					nextState.labelPosition !== workspaceState.labelPosition;
				const labelColorChanged =
					nextState.labelColor !== workspaceState.labelColor;
			const labelBackgroundOpacityChanged =
				nextState.labelBackgroundOpacity !==
				workspaceState.labelBackgroundOpacity;
			const labelDensityChanged =
				nextState.labelDensity !== workspaceState.labelDensity;
			const cubeFaceOpacityChanged =
				nextState.cubeFaceOpacity !== workspaceState.cubeFaceOpacity;
			const forceLabelsChanged =
				nextState.forceLabels !== workspaceState.forceLabels;
			const graphForceSettingsChanged =
				nextState.graphSpacing !== workspaceState.graphSpacing ||
				nextState.graphCenterForce !== workspaceState.graphCenterForce ||
				nextState.graphRepelForce !== workspaceState.graphRepelForce ||
				nextState.graphLinkForce !== workspaceState.graphLinkForce ||
				nextState.graphDragLinkForce !== workspaceState.graphDragLinkForce ||
				nextState.graphReturnForce !== workspaceState.graphReturnForce ||
				nextState.graphLinkDistance !== workspaceState.graphLinkDistance;
			const forceLayoutChanged =
				nextState.enableForceLayout !== workspaceState.enableForceLayout;
			const shouldRebuild =
				nextState.activeChartId !== lastActiveChartId ||
				nextState.projection !== lastProjection ||
				nextState.mode !== lastMode ||
				nextState.chartSource !== lastChartSource ||
					nextState.flowEdgeStyle !== lastFlowEdgeStyle ||
						nextState.flowDirection !== lastFlowDirection ||
						nextState.arcDirection !== lastArcDirection ||
						nextState.layoutRevision !== lastLayoutRevision ||
						styleRulesChanged;
				workspaceState = nextState;
				if (manualLayoutChanged) {
					lastManualLayout = nextState.manualLayout;
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
			scheduleAutoSave(nextState);
				if (fadeDistanceChanged) {
					renderer?.setFadeDistance(nextState.fadeDistance);
				}
				if (labelSizeChanged) {
					renderer?.setLabelSize(nextState.labelSize);
				}
				if (labelPositionChanged) {
					renderer?.setLabelPosition(nextState.labelPosition);
				}
				if (labelColorChanged) {
					renderer?.setLabelColor(nextState.labelColor);
				}
			if (labelBackgroundOpacityChanged) {
				renderer?.setLabelBackgroundOpacity(
					nextState.labelBackgroundOpacity,
				);
			}
			if (labelDensityChanged) {
				renderer?.setLabelDensity(nextState.labelDensity);
			}
			if (
				cubeFaceOpacityChanged &&
				renderer &&
				isCube3DRenderer(renderer)
			) {
				renderer.setCubeFaceOpacity(nextState.cubeFaceOpacity);
			}
			if (forceLabelsChanged) {
				renderer?.setForceLabels(nextState.forceLabels);
			}
			if (forceLayoutChanged && renderer) {
				if (isForce3DRenderer(renderer)) {
					renderer.setEnableForceLayout(nextState.enableForceLayout);
				}
				unbindEvents?.();
				unbindEvents = bindEventsForRenderer(renderer);
				stopForceLayoutSimulation();
			}
			if (
				graphForceSettingsChanged &&
				nextState.mode === "graph" &&
				nextState.enableForceLayout &&
				renderer &&
				!isForce3DRenderer(renderer) &&
				!isCube3DRenderer(renderer)
			) {
				stopForceLayoutSimulation();
				getOrCreateForceLayoutSimulation(renderer).start();
			}
			if (shouldRebuild) {
				lastProjection = nextState.projection;
				lastActiveChartId = nextState.activeChartId;
				lastMode = nextState.mode;
				lastChartSource = nextState.chartSource;
				lastFlowEdgeStyle = nextState.flowEdgeStyle;
					lastFlowDirection = nextState.flowDirection;
					lastArcDirection = nextState.arcDirection;
					lastManualLayout = nextState.manualLayout;
					lastLayoutRevision = nextState.layoutRevision;
				lastGlobalNodeStyleRules = nextState.globalNodeStyleRules;
				lastGlobalLinkStyleRules = nextState.globalLinkStyleRules;
				lastNodeStyleRules = nextState.nodeStyleRules;
				lastLinkStyleRules = nextState.linkStyleRules;
					void rebuildGraph(
						activeChartChanged ||
							modeChanged ||
							chartSourceChanged ||
							flowStyleChanged ||
							flowDirectionChanged ||
							arcDirectionChanged ||
							(layoutRevisionChanged && nextState.mode !== "cube"),
						flowStyleChanged ||
							flowDirectionChanged ||
							arcDirectionChanged ||
							layoutRevisionChanged ||
							chartSourceChanged,
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
			if (
				renderer &&
				(isForce3DRenderer(renderer) || isCube3DRenderer(renderer)) &&
				canvas
			) {
				renderer.setPalette(readGraphPalette(canvas));
			}
	}

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
			hydrateManualLayoutPositions(layoutSnapshot);
			const positions = layoutSnapshot.positions;
		const graph = new GraphologyAdapter(
			palette,
			getActiveDefaultNodeStyle(palette.node),
			getActiveDefaultLinkStyle(palette.edge),
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

			const rendererKind = getRendererKindForMode();
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
				if (isForce3DRenderer(renderer) || isCube3DRenderer(renderer)) {
					renderer.setPalette(palette);
				}
				if (isCube3DRenderer(renderer)) {
					renderer.setManualLayout(workspaceState.manualLayout);
				}
				renderer.setGraph(graph);
				unbindEvents = bindEventsForRenderer(renderer);
			} else {
				const nextRenderer =
					rendererKind === "force-3d"
						? await Force3DRenderer.create(
								graph,
								canvas,
								palette,
								workspaceState.fadeDistance,
								workspaceState.labelSize,
								workspaceState.labelPosition,
								workspaceState.labelColor,
								workspaceState.labelBackgroundOpacity,
								workspaceState.labelDensity,
								workspaceState.enableForceLayout,
								workspaceState.forceLabels,
								() => version !== renderVersion,
							)
						: rendererKind === "cube-3d"
							? await Cube3DRenderer.create(
									graph,
									canvas,
									palette,
									workspaceState.manualLayout,
									workspaceState.fadeDistance,
									workspaceState.labelSize,
									workspaceState.labelPosition,
									workspaceState.labelColor,
									workspaceState.labelBackgroundOpacity,
									workspaceState.labelDensity,
									workspaceState.cubeFaceOpacity,
									workspaceState.enableForceLayout,
									workspaceState.forceLabels,
									() => version !== renderVersion,
								)
							: new SigmaRenderer(
									graph,
									canvas,
									palette,
									workspaceState.fadeDistance,
									workspaceState.labelSize,
									workspaceState.labelPosition,
									workspaceState.labelColor,
									workspaceState.labelBackgroundOpacity,
									workspaceState.labelDensity,
									workspaceState.forceLabels,
								);
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
				workspaceState.mode === "graph" &&
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
				if (isForce3DRenderer(targetRenderer)) {
					return bindForce3DEvents(targetRenderer, {
					onSelect: (nodeId) => controller.selectNode(nodeId),
					onHover: (nodeId) => controller.hoverNode(nodeId),
					onOpen: (nodeId) => void controller.openNode(nodeId),
					onConnectionDrag: (state) => {
						connectionDrag = state;
						if (!state) {
							graphConnectionTargetNotePath = undefined;
							graphConnectionTargetTemplateId = undefined;
							graphConnectionTargetCurated = false;
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
				if (isCube3DRenderer(targetRenderer)) {
					return bindCube3DEvents(targetRenderer, {
						onSelect: (nodeId) => controller.selectNode(nodeId),
						onHover: (nodeId) => controller.hoverNode(nodeId),
						onOpen: (nodeId) => void controller.openNode(nodeId),
						onNodeDrag: (nodeId, position) => {
							getLayoutSnapshot().positions.set(nodeId, position);
						},
						onNodeDragEnd: (nodeId) => {
							const position = getLayoutSnapshot().positions.get(nodeId);
							if (position) {
								controller.setManualNodePosition(
									nodeId,
									position,
									targetRenderer.getNodeFace(nodeId),
								);
							}
						},
						onConnectionDrag: (state) => {
							connectionDrag = state;
							if (!state) {
								graphConnectionTargetNotePath = undefined;
								graphConnectionTargetTemplateId = undefined;
								graphConnectionTargetCurated = false;
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
				return bindGraphEvents(targetRenderer, {
				enableForceLayout:
					workspaceState.mode === "graph" && workspaceState.enableForceLayout,
				enableNodeDragging: workspaceState.mode === "free",
				onSelect: (nodeId) => controller.selectNode(nodeId),
				onHover: (nodeId) => controller.hoverNode(nodeId),
				onOpen: (nodeId) => {
					if (Date.now() < suppressNodeOpenUntil) {
						return;
					}
					void controller.openNode(nodeId);
				},
				onNodeDrag: (nodeId, position) => {
					suppressNodeOpenUntil = Date.now() + 700;
					targetRenderer.holdCurrentBounds();
					if (workspaceState.mode === "free") {
						targetRenderer.runtimeGraph.mergeNodeAttributes(nodeId, {
							x: position.x,
							y: position.y,
							fixed: true,
						});
					} else {
						getOrCreateForceLayoutSimulation(targetRenderer).drag(
							nodeId,
							position,
						);
					}
					getLayoutSnapshot().positions.set(nodeId, position);
					if (workspaceState.mode === "free") {
						const viewportPosition =
							targetRenderer.instance.graphToViewport(position);
						activeNodeDropGroupId =
							targetRenderer.getGroupAtViewportPosition(viewportPosition);
						targetRenderer.setActiveDropGroup(activeNodeDropGroupId);
					}
					targetRenderer.instance.refresh();
				},
				onNodeDragEnd: (nodeId) => {
					suppressNodeOpenUntil = Date.now() + 700;
					if (workspaceState.mode === "free") {
						const position = getLayoutSnapshot().positions.get(nodeId);
						if (position) {
							controller.setManualNodePosition(
								nodeId,
								position,
								activeNodeDropGroupId,
							);
						}
						targetRenderer.setActiveDropGroup(undefined);
						activeNodeDropGroupId = undefined;
						return;
					}
					forceLayoutSimulation?.release(nodeId);
				},
			onConnectionDrag: (state) => {
				connectionDrag = state;
				if (!state) {
					graphConnectionTargetNotePath = undefined;
					graphConnectionTargetTemplateId = undefined;
					graphConnectionTargetCurated = false;
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

			function isForce3DRenderer(
				targetRenderer: GraphRenderer,
			): targetRenderer is Force3DRenderer {
				return targetRenderer instanceof Force3DRenderer;
			}

			function isCube3DRenderer(
				targetRenderer: GraphRenderer,
			): targetRenderer is Cube3DRenderer {
				return targetRenderer instanceof Cube3DRenderer;
			}

			type RendererKind = "sigma" | "force-3d" | "cube-3d";

			function getRendererKind(targetRenderer: GraphRenderer): RendererKind {
				if (isForce3DRenderer(targetRenderer)) {
					return "force-3d";
				}
				if (isCube3DRenderer(targetRenderer)) {
					return "cube-3d";
				}
				return "sigma";
			}

			function getRendererKindForMode(): RendererKind {
				if (workspaceState.mode === "graph-3d") {
					return "force-3d";
				}
				if (workspaceState.mode === "cube") {
					return "cube-3d";
				}
				return "sigma";
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
				workspaceState.mode === "free" ? workspaceState.manualLayout.groups : [],
				{
					onMovePreview: moveRuntimeGroupNodes,
					onMoveCommit: (groupId, delta) =>
						controller.moveGroup(groupId, delta),
					onResizeCommit: (groupId, geometry) =>
						controller.resizeGroup(groupId, geometry),
					getGroupNodeIds: (groupId) =>
						Object.entries(workspaceState.manualLayout.nodes)
							.filter(([, placement]) => placement.groupId === groupId)
							.map(([nodeId]) => nodeId),
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
			const graph = renderer.runtimeGraph;
			const snapshot = getLayoutSnapshot();
			for (const [nodeId, placement] of Object.entries(
				workspaceState.manualLayout.nodes,
			)) {
				if (placement.groupId !== groupId || !graph.hasNode(nodeId)) {
					continue;
				}
				const attributes = graph.getNodeAttributes(nodeId);
				const position = {
					x: attributes.x + delta.x,
					y: attributes.y + delta.y,
				};
				graph.mergeNodeAttributes(nodeId, position);
				snapshot.positions.set(nodeId, position);
			}
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
					getGraphForceSettings(),
					(nodeId, position) => {
						getLayoutSnapshot().positions.set(nodeId, position);
					},
				);
			}
			return forceLayoutSimulation;
		}

		function getGraphForceSettings() {
			return {
				centerForce: workspaceState.graphCenterForce,
				repelForce: workspaceState.graphRepelForce,
				linkForce: workspaceState.graphLinkForce,
				dragLinkForce: workspaceState.graphDragLinkForce,
				returnForce: workspaceState.graphReturnForce,
				linkDistance: workspaceState.graphLinkDistance,
			};
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
			return resolveNodeStyle(selectedNode, getActiveNodeStyleRules(), {
				...getActiveDefaultNodeStyle(defaultColor),
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
						...getActiveDefaultNodeStyle(defaultColor),
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
			const needsGraphLayout = firstLayout;

			if (workspaceState.mode === "arc") {
				await new ArcLayout(
					workspaceState.arcSpacing,
					workspaceState.arcDirection,
				).apply(graph);
				snapshot.edgeIds = currentEdgeIds;
				snapshot.orthogonalRoutes = new Map();
			} else if (workspaceState.mode === "hierarchical-edge-bundling") {
				await new HierarchicalEdgeBundlingLayout().apply(graph);
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
			} else if (workspaceState.mode === "free") {
				snapshot.edgeIds = currentEdgeIds;
				snapshot.orthogonalRoutes = new Map();
				} else if (workspaceState.mode === "graph") {
					if (needsGraphLayout) {
						await new ForceAtlasLayout(
							workspaceState.graphSpacing,
							getGraphForceSettings(),
						).apply(graph);
					}
			} else if (workspaceState.mode === "graph-3d") {
				snapshot.edgeIds = currentEdgeIds;
			} else if (workspaceState.mode === "cube") {
				snapshot.edgeIds = currentEdgeIds;
				snapshot.orthogonalRoutes = new Map();
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
				if (workspaceState.mode === "graph-3d") {
					return `${workspaceState.activeChartId}-graph-3d`;
				}
				if (workspaceState.mode === "cube") {
					return `${workspaceState.activeChartId}-cube`;
				}
				if (workspaceState.mode === "free") {
					return `${workspaceState.activeChartId}-free`;
				}
		if (workspaceState.mode === "arc") {
			return `${workspaceState.activeChartId}-arc-${workspaceState.arcDirection}`;
		}
			return `${workspaceState.activeChartId}-flow-${workspaceState.flowEdgeStyle}-${workspaceState.flowDirection}`;
		}

		function hydrateManualLayoutPositions(snapshot: LayoutSnapshot): void {
				if (workspaceState.mode !== "free" && workspaceState.mode !== "cube") {
					return;
				}
			for (const [nodeId, placement] of Object.entries(
				workspaceState.manualLayout.nodes,
			)) {
				snapshot.positions.set(nodeId, { x: placement.x, y: placement.y });
			}
		}

	function getLogicalEdgeIds(graph: RuntimeGraph): Set<string> {
		return new Set(
			graph
				.edges()
				.filter((edge) => !graph.getEdgeAttribute(edge, "hidden")),
		);
	}

	function getActiveLinkStyleRules() {
		return [...workspaceState.globalLinkStyleRules, ...workspaceState.linkStyleRules];
	}

	function getActiveNodeStyleRules() {
		return [...workspaceState.globalNodeStyleRules, ...workspaceState.nodeStyleRules];
	}

	function getActiveDefaultNodeStyle(
		fallbackColor: string,
	): Required<DefaultNodeStyle> {
		return {
			color:
				workspaceState.nodeStyleOverrides.color ??
				workspaceState.defaultNodeStyle.color ??
				fallbackColor,
			size:
				workspaceState.nodeStyleOverrides.size ??
				workspaceState.defaultNodeStyle.size,
		};
	}

	function getActiveDefaultLinkStyle(
		fallbackColor: string,
	): Required<DefaultLinkStyle> {
		return {
			color:
				workspaceState.linkStyleOverrides.color ??
				workspaceState.defaultLinkStyle.color ??
				fallbackColor,
			size:
				workspaceState.linkStyleOverrides.size ??
				workspaceState.defaultLinkStyle.size,
			lineStyle:
				workspaceState.linkStyleOverrides.lineStyle ??
				workspaceState.defaultLinkStyle.lineStyle,
			label:
				workspaceState.linkStyleOverrides.label ??
				workspaceState.defaultLinkStyle.label,
			showLabel:
				workspaceState.linkStyleOverrides.showLabel ??
				workspaceState.defaultLinkStyle.showLabel,
			hidden:
				workspaceState.linkStyleOverrides.hidden ??
				workspaceState.defaultLinkStyle.hidden,
		};
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

	function getFilePathSuggestions(snapshot: DebugSnapshot): string[] {
		return snapshot.index.nodes
			.map((node) => node.path)
			.sort((first, second) =>
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
			.then(() => {
				controller.addCuratedFile(payload.notePath);
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

	function readCuratedDropTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) {
			return false;
		}
		return Boolean(target.closest("[data-curated-drop-target]"));
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
