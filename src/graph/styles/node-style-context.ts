import type { ChartGroupingConfig, KnowledgeNode } from '../../core/types';
import { resolveChartGroupOwnership } from '../../query/group-ownership';
import type { NodeStyleContext } from './style-rules';

export function resolveNodeStyleContext(
	node: KnowledgeNode,
	grouping: ChartGroupingConfig,
): NodeStyleContext {
	return resolveNodeStyleContexts([node], grouping).get(node.id) ?? {};
}

export function resolveNodeStyleContexts(
	nodes: readonly KnowledgeNode[],
	grouping: ChartGroupingConfig,
): ReadonlyMap<string, NodeStyleContext> {
	const ownership = resolveChartGroupOwnership(nodes, grouping);
	const groupNamesById = new Map(
		grouping.groups.map((group) => [group.id, group.name] as const),
	);
	return new Map(
		nodes.map((node) => {
			const ownerId = ownership.byNode.get(node.id)?.groupId;
			const ownerName = ownerId ? groupNamesById.get(ownerId) : undefined;
			return [
				node.id,
				{
					groupIds: ownerId ? [ownerId] : [],
					groupNames: ownerName ? [ownerName] : [],
				},
			];
		}),
	);
}
