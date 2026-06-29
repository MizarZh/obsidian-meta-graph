import type { RendererDebugState } from '../../core/types';
import type { RuntimeGraph } from './graphology-adapter';

export function serializeRuntimeGraph(
	graph: RuntimeGraph,
): NonNullable<RendererDebugState['runtimeGraph']> {
	return {
		nodeCount: graph.order,
		edgeCount: graph.size,
		nodes: graph.mapNodes((id, attributes) => ({
			id,
			x: attributes.x,
			y: attributes.y,
			label: attributes.label,
		})),
		edges: graph.mapEdges((id, attributes, source, target) => ({
			id,
			source,
			target,
			type: attributes.type,
			hidden: attributes.hidden,
		})),
	};
}
