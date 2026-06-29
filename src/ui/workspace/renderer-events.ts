import type { ViewMode } from '../../core/types';
import type { ConnectionDragState } from '../../graph/graph-events';
import type { GraphPosition } from '../../graph/graphology-adapter';
import {
	getModeCapabilities,
	type GraphRenderer,
} from '../../graph/renderer-adapter';
import { bindRendererEvents } from '../../graph/renderer-events-adapter';
import type { SigmaRenderer } from '../../graph/sigma-renderer';
import type { D3ForceSimulation } from '../../layouts/d3-force-simulation';
import type { LayoutSnapshot } from '../../layouts/stable-layout';
import {
	getNextNodeOpenSuppressUntil,
	getSigmaDragAction,
	getSigmaDragEndAction,
	shouldOpenNode,
} from '../interactions/graph-interaction-policy';

export interface WorkspaceRendererEventOptions {
	renderer: GraphRenderer;
	mode: ViewMode;
	enableForceLayout: boolean;
	getLayoutSnapshot(): LayoutSnapshot;
	getOrCreateForceLayoutSimulation(renderer: SigmaRenderer): D3ForceSimulation;
	getForceLayoutSimulation(): D3ForceSimulation | undefined;
	getSuppressNodeOpenUntil(): number;
	setSuppressNodeOpenUntil(value: number): void;
	getActiveNodeDropGroupId(): string | undefined;
	setActiveNodeDropGroupId(groupId?: string): void;
	onSelect(nodeId?: string): void;
	onHover(nodeId?: string): void;
	onOpen(nodeId: string): void;
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
		onHover: (nodeId?: string) => options.onHover(nodeId),
		onOpen: (nodeId: string) => options.onOpen(nodeId),
		onConnectionDrag: (state?: ConnectionDragState) =>
			options.onConnectionDrag(state),
		onConnect: (sourceNodeId: string, targetNodeId: string) =>
			options.onConnect(sourceNodeId, targetNodeId),
	};

	return bindRendererEvents(options.renderer, {
		force3d: () => baseCallbacks,
		cube3d: (cubeRenderer) => ({
			...baseCallbacks,
			onNodeDrag: (nodeId, position) => {
				options.getLayoutSnapshot().positions.set(nodeId, position);
			},
			onNodeDragEnd: (nodeId) => {
				const position = options.getLayoutSnapshot().positions.get(nodeId);
				if (position) {
					options.onCommitManualNodePosition(
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
				capabilities.usesSigmaForceSimulation && options.enableForceLayout,
			enableNodeDragging: capabilities.supportsFreeNodeDrag,
			onOpen: (nodeId) => {
				if (!shouldOpenNode(Date.now(), options.getSuppressNodeOpenUntil())) {
					return;
				}
				options.onOpen(nodeId);
			},
			onNodeDrag: (nodeId, position) => {
				options.setSuppressNodeOpenUntil(
					getNextNodeOpenSuppressUntil(Date.now()),
				);
				sigmaRenderer.holdCurrentBounds();
				if (getSigmaDragAction(capabilities).kind === 'manual-position') {
					sigmaRenderer.runtimeGraph.mergeNodeAttributes(nodeId, {
						x: position.x,
						y: position.y,
						fixed: true,
					});
				} else {
					options
						.getOrCreateForceLayoutSimulation(sigmaRenderer)
						.drag(nodeId, position);
				}
				options.getLayoutSnapshot().positions.set(nodeId, position);
				if (capabilities.supportsFreeNodeDrag) {
					const viewportPosition =
						sigmaRenderer.instance.graphToViewport(position);
					const groupId =
						sigmaRenderer.getGroupAtViewportPosition(viewportPosition);
					options.setActiveNodeDropGroupId(groupId);
					sigmaRenderer.setActiveDropGroup(groupId);
				}
				sigmaRenderer.instance.refresh();
			},
			onNodeDragEnd: (nodeId) => {
				options.setSuppressNodeOpenUntil(
					getNextNodeOpenSuppressUntil(Date.now()),
				);
				if (
					getSigmaDragEndAction(capabilities).kind ===
					'commit-manual-position'
				) {
					const position = options.getLayoutSnapshot().positions.get(nodeId);
					if (position) {
						options.onCommitManualNodePosition(
							nodeId,
							position,
							options.getActiveNodeDropGroupId(),
						);
					}
					sigmaRenderer.setActiveDropGroup(undefined);
					options.setActiveNodeDropGroupId(undefined);
					return;
				}
				options.getForceLayoutSimulation()?.release(nodeId);
			},
		}),
	});
}
