import type { KnowledgeEdge } from '@/core/types';
import type {
	RuntimeGraph,
	RuntimeEdgeAttributes,
} from '@/graph/model/graphology-adapter';
import type { PlanarEdgeRoute } from '@/layouts/planar-geometry';

export interface LogicalExportEdge {
	id: string;
	source: string;
	target: string;
	directed: boolean;
	attributes: RuntimeEdgeAttributes;
	runtimeIds: string[];
	route?: PlanarEdgeRoute;
}

export function logicalExportEdges(
	graph: RuntimeGraph,
	routes?: ReadonlyMap<string, PlanarEdgeRoute>,
	relationships: readonly KnowledgeEdge[] = [],
): LogicalExportEdge[] {
	const canonical = new Map(relationships.map((edge) => [edge.id, edge]));
	const groups = new Map<string, LogicalExportEdge>();
	graph.forEachEdge((runtimeId, attributes, source, target) => {
		const id = attributes.logicalEdgeId ?? runtimeId;
		const existing = groups.get(id);
		if (existing) {
			existing.runtimeIds.push(runtimeId);
			if (attributes.label)
				existing.attributes = {
					...existing.attributes,
					label: attributes.label,
					forceLabel: attributes.forceLabel,
				};
			return;
		}
		const route = routes?.get(id);
		const edge = canonical.get(id);
		groups.set(id, {
			id,
			source:
				edge?.source ??
				route?.source ??
				attributes.logicalSource ??
				source,
			target:
				edge?.target ??
				route?.target ??
				attributes.logicalTarget ??
				target,
			directed: edge?.directed ?? graph.isDirected(runtimeId),
			attributes: { ...attributes },
			runtimeIds: [runtimeId],
			route,
		});
	});
	return [...groups.values()].filter((edge) => {
		if (
			![edge.source, edge.target].every(
				(id) =>
					graph.hasNode(id) &&
					!graph.getNodeAttribute(id, 'isBend') &&
					!graph.getNodeAttribute(id, 'hidden'),
			)
		)
			return false;
		return (
			!edge.attributes.styleHidden &&
			edge.runtimeIds.some((id) => !graph.getEdgeAttribute(id, 'hidden'))
		);
	});
}
