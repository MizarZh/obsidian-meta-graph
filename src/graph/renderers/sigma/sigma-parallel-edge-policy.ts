import type { RuntimeEdgeAttributes } from '../../model/graphology-adapter';

export function isCanvasParallelEdge(
	data: RuntimeEdgeAttributes,
	extremities: readonly [string, string],
): boolean {
	if (
		(data.parallelCount ?? 1) < 2 ||
		data.parallelRouteOwner === 'layout'
	) {
		return false;
	}
	const [source, target] = extremities;
	return (data.logicalSource ?? source) !== (data.logicalTarget ?? target);
}
