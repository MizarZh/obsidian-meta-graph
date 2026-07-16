import type {
	GraphPosition,
	RuntimeGraph,
} from '../../graph/model/graphology-adapter';

export function getGroupNodeIds(
	groupByNode: ReadonlyMap<string, string>,
	groupId: string,
): string[] {
	return [...groupByNode]
		.filter(([, assignedGroupId]) => assignedGroupId === groupId)
		.map(([nodeId]) => nodeId);
}

export function moveRuntimeGroupNodes(
	graph: RuntimeGraph,
	positions: Map<string, GraphPosition>,
	nodeIds: Iterable<string>,
	delta: GraphPosition,
): void {
	for (const nodeId of nodeIds) {
		if (!graph.hasNode(nodeId)) {
			continue;
		}
		const attributes = graph.getNodeAttributes(nodeId);
		const position = {
			x: attributes.x + delta.x,
			y: attributes.y + delta.y,
		};
		graph.mergeNodeAttributes(nodeId, position);
		positions.set(nodeId, position);
	}
}
