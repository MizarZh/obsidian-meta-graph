import type { ManualLayoutConfig } from '../../core/types';
import type { GraphPosition, RuntimeGraph } from '../../graph/model/graphology-adapter';

export function getManualGroupNodeIds(
	nodes: ManualLayoutConfig['nodes'],
	groupId: string,
): string[] {
	return Object.entries(nodes)
		.filter(([, placement]) => placement.groupId === groupId)
		.map(([nodeId]) => nodeId);
}

export function moveRuntimeManualGroupNodes(
	graph: RuntimeGraph,
	positions: Map<string, GraphPosition>,
	nodes: ManualLayoutConfig['nodes'],
	groupId: string,
	delta: GraphPosition,
): void {
	for (const nodeId of getManualGroupNodeIds(nodes, groupId)) {
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
