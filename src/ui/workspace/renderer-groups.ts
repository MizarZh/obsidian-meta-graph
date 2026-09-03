import type {
	ChartGroupingConfig,
	ManualLayoutConfig,
	ViewMode,
} from '../../core/types';
import type { GraphPosition } from '../../graph/model/graphology-adapter';
import {
	getRendererCapabilities,
	getModeCapabilities,
	isCube3DRenderer,
	isForce3DRenderer,
	type GraphRenderer,
} from '../../graph/renderers/renderer-adapter';
import type { GroupInteractionCallbacks } from '../../graph/renderers/sigma/sigma-renderer';
import type { GroupOverlayGroup } from '../../graph/renderers/sigma/sigma-group-overlay';
import {
	canMoveGroup,
	normalizeGroupFrameForShape,
	resolveGroupShape,
} from '../../layouts/group-shape';
import type { LayoutSnapshot } from '../../layouts/stable-layout';
import {
	getGroupNodeIds,
	moveRuntimeGroupNodes,
} from '../interactions/manual-layout-groups';
import { createCubeRendererManualLayout } from '../../workspace/state/manual-layout/cube-layout';

export function syncWorkspaceRendererGroups(
	renderer: GraphRenderer | undefined,
	mode: ViewMode,
	manualLayout: ManualLayoutConfig,
	grouping: ChartGroupingConfig,
	groupByNode: ReadonlyMap<string, string>,
	layoutSnapshot: LayoutSnapshot,
	forceLayoutEnabled: boolean,
	callbacks: GroupInteractionCallbacks,
): void {
	if (!renderer) {
		return;
	}
	const capabilities = getRendererCapabilities(renderer);
	if (capabilities.supportsManualLayout) {
		if (!isCube3DRenderer(renderer)) {
			return;
		}
		renderer.setManualLayout(
			createCubeRendererManualLayout(
				{ engine: 'cube-3d', spacing: 1, manual: manualLayout },
				grouping,
			),
		);
		return;
	}
	if (
		!capabilities.supportsGroupOverlay ||
		!capabilities.supportsLayoutGroupGeometry
	) {
		return;
	}
	if (isForce3DRenderer(renderer) || isCube3DRenderer(renderer)) {
		return;
	}
	const getGroupNodeIdsForGroup = (groupId: string): string[] =>
		getGroupNodeIds(groupByNode, groupId);
	renderer.setLayoutGroupGeometries(
		mode === 'graph'
			? layoutSnapshot.groupGeometries.map((geometry) =>
					geometry.kind === 'graph-container'
						? {
								kind: 'member-halos' as const,
								groupId: geometry.groupId,
								name: geometry.name,
								color: geometry.color,
								nodeIds: geometry.nodeIds,
							}
						: geometry,
				)
			: layoutSnapshot.groupGeometries,
		getGroupNodeIdsForGroup,
	);
	renderer.setGroups(
		createOverlayGroups(
			mode,
			manualLayout,
			grouping,
			layoutSnapshot,
			forceLayoutEnabled,
		),
		{
			...callbacks,
			getGroupNodeIds: getGroupNodeIdsForGroup,
		},
	);
}

function createOverlayGroups(
	mode: ViewMode,
	manualLayout: ManualLayoutConfig,
	grouping: ChartGroupingConfig,
	layoutSnapshot: LayoutSnapshot,
	forceLayoutEnabled: boolean,
): GroupOverlayGroup[] {
	if (mode === 'graph') {
		const definitions = new Map(
			grouping.groups.map((group) => [group.id, group] as const),
		);
		return layoutSnapshot.groupGeometries.flatMap((geometry) => {
			if (geometry.kind !== 'graph-container') {
				return [];
			}
			const definition = definitions.get(geometry.groupId);
			if (!definition) {
				return [];
			}
			return [
				{
					...definition,
					shape: resolveGroupShape(mode, definition.shape),
					x: 0,
					y: 0,
					width: 1,
					height: 1,
					dynamicNodeIds: geometry.nodeIds,
					movable: canMoveGroup(mode, forceLayoutEnabled),
					resizable: false,
				},
			];
		});
	}
	if (!getModeCapabilities(mode).supportsManualGroups) {
		return [];
	}
	return grouping.groups.flatMap((group) => {
		const frame = manualLayout.groupFrames?.[group.id];
		const shape = resolveGroupShape(mode, group.shape);
		return frame
			? [
					{
						...group,
						...normalizeGroupFrameForShape(frame, shape),
						shape,
						movable: canMoveGroup(mode, forceLayoutEnabled),
						resizable: true,
					},
				]
			: [];
	});
}

export function moveWorkspaceRuntimeGroupNodes(
	renderer: GraphRenderer | undefined,
	layoutSnapshot: LayoutSnapshot,
	nodeIds: Iterable<string>,
	delta: GraphPosition,
): void {
	if (!renderer || !getRendererCapabilities(renderer).supportsGroupOverlay) {
		return;
	}
	if (isForce3DRenderer(renderer) || isCube3DRenderer(renderer)) {
		return;
	}
	moveRuntimeGroupNodes(
		renderer.runtimeGraph,
		layoutSnapshot.positions,
		nodeIds,
		delta,
	);
	if (typeof renderer.refresh === 'function') {
		renderer.refresh();
	} else {
		renderer.instance.refresh();
	}
}
