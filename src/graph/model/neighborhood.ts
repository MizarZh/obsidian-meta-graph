import type { RuntimeGraph } from './graphology-adapter';

export function immediateNeighborhood(
	graph: RuntimeGraph,
	nodeId: string,
): Set<string> {
	const neighbors = new Set([nodeId]);
	graph.forEachEdge(
		nodeId,
		(
			_edge,
			attributes,
			source,
			target,
			_sourceAttributes,
			_targetAttributes,
		) => {
			if (
				attributes.logicalSource === nodeId &&
				attributes.logicalTarget
			) {
				neighbors.add(attributes.logicalTarget);
			} else if (
				attributes.logicalTarget === nodeId &&
				attributes.logicalSource
			) {
				neighbors.add(attributes.logicalSource);
			} else {
				neighbors.add(source === nodeId ? target : source);
			}
		},
	);
	return neighbors;
}
