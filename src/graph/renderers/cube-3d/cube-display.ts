import type { ManualLayoutConfig } from '../../../core/types';
import type {
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import {
	type CubeFaceId,
	findOpenDisplayPosition,
	getCubeFaceIdForNode,
	hashString,
	hasCubeDisplayOverlap,
} from './cube-faces';

export interface CubeDisplayPosition {
	faceId: CubeFaceId;
	x: number;
	y: number;
}

export function resolveCubeDisplayPositions(
	graph: RuntimeGraph,
	manualLayout: ManualLayoutConfig,
): Map<string, CubeDisplayPosition> {
	const positions = new Map<string, CubeDisplayPosition>();
	const byFace = new Map<
		CubeFaceId,
		Array<{ id: string; x: number; y: number }>
	>();
	for (const nodeId of graph.nodes()) {
		const attributes = graph.getNodeAttributes(nodeId);
		if (attributes.isBend) {
			continue;
		}
		const placement = manualLayout.nodes[nodeId];
		const faceId = getCubeFaceIdForNode(nodeId, placement?.groupId);
		const position = placement ?? { x: attributes.x, y: attributes.y };
		const bucket = byFace.get(faceId) ?? [];
		bucket.push({ id: nodeId, x: position.x, y: position.y });
		byFace.set(faceId, bucket);
	}
	for (const [faceId, items] of byFace) {
		const occupied: Array<{ x: number; y: number }> = [];
		for (const item of items) {
			const overlaps = occupied.some((position) =>
				hasCubeDisplayOverlap(position, item),
			);
			const position = overlaps
				? findOpenDisplayPosition(occupied.length + 1, occupied)
				: { x: item.x, y: item.y };
			positions.set(item.id, { faceId, ...position });
			occupied.push(position);
		}
	}
	return positions;
}

export function shouldShowCubeLabel(
	attributes: RuntimeNodeAttributes,
	labelDensity: number,
	forceLabels: boolean,
): boolean {
	if (forceLabels || attributes.isPrimary) {
		return true;
	}
	return hashString(attributes.path) <= labelDensity;
}
