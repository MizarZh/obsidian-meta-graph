import type { ManualLayoutConfig, ViewMode } from '../../core/types';
import type { GraphPosition } from '../../graph/model/graphology-adapter';
import {
	getModeCapabilities,
	isCube3DRenderer,
	isForce3DRenderer,
	type GraphRenderer,
} from '../../graph/renderers/renderer-adapter';
import type { GroupInteractionCallbacks } from '../../graph/renderers/sigma/sigma-renderer';
import type { LayoutSnapshot } from '../../layouts/stable-layout';
import {
	getManualGroupNodeIds,
	moveRuntimeManualGroupNodes,
} from '../interactions/manual-layout-groups';

export function syncWorkspaceRendererGroups(
	renderer: GraphRenderer | undefined,
	mode: ViewMode,
	manualLayout: ManualLayoutConfig,
	callbacks: GroupInteractionCallbacks,
): void {
	if (!renderer || isForce3DRenderer(renderer)) {
		return;
	}
	if (isCube3DRenderer(renderer)) {
		renderer.setManualLayout(manualLayout);
		return;
	}
	renderer.setGroups(
		getModeCapabilities(mode).supportsManualGroups ? manualLayout.groups : [],
		{
			...callbacks,
			getGroupNodeIds: (groupId) =>
				getManualGroupNodeIds(manualLayout.nodes, groupId),
		},
	);
}

export function moveWorkspaceRuntimeGroupNodes(
	renderer: GraphRenderer | undefined,
	layoutSnapshot: LayoutSnapshot,
	manualLayout: ManualLayoutConfig,
	groupId: string,
	delta: GraphPosition,
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
		layoutSnapshot.positions,
		manualLayout.nodes,
		groupId,
		delta,
	);
	renderer.instance.refresh();
}
