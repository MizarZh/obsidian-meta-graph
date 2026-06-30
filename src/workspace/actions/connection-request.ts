import type { DockConnectionDirection, NodeId } from '../../core/types';

export interface NormalizedConnectionRequest {
	sourceNodeId: NodeId;
	targetNodeId: NodeId;
	field: string;
}

export function normalizeConnectionRequest(
	field: string,
	sourceNodeId: NodeId,
	targetNodeId: NodeId,
): NormalizedConnectionRequest | null {
	const normalizedField = field.trim();
	if (
		!normalizedField ||
		!sourceNodeId.trim() ||
		!targetNodeId.trim() ||
		sourceNodeId === targetNodeId
	) {
		return null;
	}
	return {
		sourceNodeId,
		targetNodeId,
		field: normalizedField,
	};
}

export function normalizeDockConnectionRequest(
	notePath: NodeId,
	targetNodeId: NodeId,
	direction: DockConnectionDirection,
	field: string,
): NormalizedConnectionRequest | null {
	const [sourceNodeId, targetPath] =
		direction === 'from-dock-to-graph'
			? [notePath, targetNodeId]
			: [targetNodeId, notePath];
	return normalizeConnectionRequest(field, sourceNodeId, targetPath);
}
