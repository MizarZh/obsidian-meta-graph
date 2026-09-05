import type { ViewMode } from '../../core/types';
import type {
	ConnectionDragState,
	GraphContextMenuTarget,
} from '../../graph/renderers/renderer-events';
import type { GraphPosition } from '../../graph/model/graphology-adapter';
import {
	getModeCapabilities,
	isForceSimulationRenderer,
	type ForceSimulationRenderer,
	type GraphRenderer,
	type PlanarRenderer,
} from '../../graph/renderers/renderer-adapter';
import { bindRendererEvents } from '../../graph/renderers/renderer-events-adapter';
import type { D3ForceSimulation } from '../../layouts/d3-force-simulation';
import type { LayoutSnapshot } from '../../layouts/stable-layout';
import {
	getNextNodeOpenSuppressUntil,
	getPlanarDragAction,
	getPlanarDragEndAction,
	shouldOpenNode,
} from '../interactions/graph-interaction-policy';

export interface WorkspaceRendererEventOptions {
	renderer: GraphRenderer;
	mode: ViewMode;
	readOnly?: boolean;
	enableForceLayout: boolean;
	getLayoutSnapshot(): LayoutSnapshot;
	getOrCreateForceLayoutSimulation(
		renderer: ForceSimulationRenderer,
	): D3ForceSimulation;
	getForceLayoutSimulation(): D3ForceSimulation | undefined;
	getSuppressNodeOpenUntil(): number;
	setSuppressNodeOpenUntil(value: number): void;
	getActiveNodeDropGroupId(): string | undefined;
	setActiveNodeDropGroupId(groupId?: string): void;
	onSelect(nodeId?: string): void;
	onSelectEdge(edgeId: string): void;
	onSelectGroup(groupId: string): void;
	onHover(nodeId?: string): void;
	onOpen(nodeId: string): void;
	onContextMenu?(target: GraphContextMenuTarget, event: MouseEvent): void;
	onConnectionDrag(state: ConnectionDragState | undefined): void;
	onConnect(sourceNodeId: string, targetNodeId: string): void;
	onCommitManualNodePosition(
		nodeId: string,
		position: GraphPosition,
		groupId?: string,
	): void;
}

export function bindWorkspaceRendererEvents(
	options: WorkspaceRendererEventOptions,
): () => void {
	const capabilities = getModeCapabilities(options.mode);
	const baseCallbacks = {
		onSelect: (nodeId?: string) => options.onSelect(nodeId),
		onSelectEdge: (edgeId: string) => options.onSelectEdge(edgeId),
		onSelectGroup: (groupId: string) => options.onSelectGroup(groupId),
		onHover: (nodeId?: string) => options.onHover(nodeId),
		onOpen: (nodeId: string) => options.onOpen(nodeId),
		onContextMenu: (target: GraphContextMenuTarget, event: MouseEvent) =>
			options.onContextMenu?.(target, event),
		onConnectionDrag: (state?: ConnectionDragState) => {
			if (!options.readOnly) options.onConnectionDrag(state);
		},
		onConnect: (sourceNodeId: string, targetNodeId: string) => {
			if (!options.readOnly)
				options.onConnect(sourceNodeId, targetNodeId);
		},
	};

	return bindRendererEvents(options.renderer, {
		force3d: () => baseCallbacks,
		cube3d: (cubeRenderer) => ({
			...baseCallbacks,
			onNodeDrag: (nodeId, position) => {
				if (options.readOnly) return;
				options.getLayoutSnapshot().positions.set(nodeId, position);
			},
			onNodeDragEnd: (nodeId) => {
				if (options.readOnly) return;
				const placement = cubeRenderer.getNodeManualPlacement(nodeId);
				const position =
					placement ??
					options.getLayoutSnapshot().positions.get(nodeId);
				if (position) {
					options.onCommitManualNodePosition(
						nodeId,
						position,
						placement?.groupId ?? cubeRenderer.getNodeFace(nodeId),
					);
				}
			},
		}),
		planar: (planarRenderer) => ({
			...baseCallbacks,
			enableForceLayout:
				capabilities.usesExternal2DForceSimulation &&
				options.enableForceLayout &&
				isForceSimulationRenderer(planarRenderer),
			enableNodeDragging:
				!options.readOnly && capabilities.supportsFreeNodeDrag,
			onOpen: (nodeId) => {
				if (
					!shouldOpenNode(
						Date.now(),
						options.getSuppressNodeOpenUntil(),
					)
				) {
					return;
				}
				options.onOpen(nodeId);
			},
			onNodeDrag: (nodeId, position, viewportPosition) => {
				if (options.readOnly) return;
				options.setSuppressNodeOpenUntil(
					getNextNodeOpenSuppressUntil(Date.now()),
				);
				const dragAction = getPlanarDragAction(capabilities);
				let appliedPosition = position;
				if (dragAction.kind === 'manual-position') {
					planarRenderer.holdCurrentBounds();
					planarRenderer.runtimeGraph.mergeNodeAttributes(nodeId, {
						fixed: true,
					});
					planarRenderer.setNodePosition(nodeId, position);
					appliedPosition =
						planarRenderer.getNodePosition(nodeId) ?? position;
				} else {
					if (!isForceSimulationRenderer(planarRenderer)) return;
					options
						.getOrCreateForceLayoutSimulation(planarRenderer)
						.drag(nodeId, position, viewportPosition);
				}
				options
					.getLayoutSnapshot()
					.positions.set(nodeId, appliedPosition);
				if (capabilities.supportsFreeNodeDrag) {
					const viewportPosition =
						planarRenderer.graphToViewportPosition(appliedPosition);
					const groupId =
						planarRenderer.getGroupAtViewportPosition(
							viewportPosition,
						);
					options.setActiveNodeDropGroupId(groupId);
					planarRenderer.setActiveDropGroup(groupId);
				}
			},
			onNodeDragEnd: (nodeId) => {
				if (options.readOnly) return;
				options.setSuppressNodeOpenUntil(
					getNextNodeOpenSuppressUntil(Date.now()),
				);
				if (
					getPlanarDragEndAction(capabilities).kind ===
					'commit-manual-position'
				) {
					const position = options
						.getLayoutSnapshot()
						.positions.get(nodeId);
					if (position) {
						options.onCommitManualNodePosition(
							nodeId,
							position,
							options.getActiveNodeDropGroupId(),
						);
					}
					planarRenderer.setActiveDropGroup(undefined);
					options.setActiveNodeDropGroupId(undefined);
					return;
				}
				options.getForceLayoutSimulation()?.release(nodeId);
			},
		}),
	});
}
