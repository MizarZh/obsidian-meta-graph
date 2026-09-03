import type { ChartGroup } from '../../core/types';
import type { ResolvedGroupShape } from '../../layouts/group-shape';

export interface GroupGeometry {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface GroupInteractionCallbacks {
	onSelectGroup?(groupId: string): void;
	onContextMenu?(groupId: string, event: MouseEvent): void;
	onMoveStart?(groupId: string): void;
	onMovePreview?(groupId: string, delta: { x: number; y: number }): void;
	onMoveCommit?(groupId: string, delta: { x: number; y: number }): void;
	onMoveEnd?(groupId: string): void;
	onResizeCommit?(groupId: string, geometry: GroupGeometry): void;
	getGroupNodeIds?(groupId: string): Iterable<string>;
}

export interface GroupOverlayGroup extends ChartGroup {
	shape: ResolvedGroupShape;
	dynamicNodeIds?: string[];
	movable?: boolean;
	resizable?: boolean;
}
