import type { ChartGroupingConfig, KnowledgeNode } from '../../core/types';
import { resolveChartGroupOwnership } from '../../query/group-ownership';
import type { NodeStyleContext } from './style-rules';

export function resolveNodeStyleContext(
	node: KnowledgeNode,
	grouping: ChartGroupingConfig,
): NodeStyleContext {
	const groupIds = new Set<string>();
	const groupNames = new Set<string>();
	const ownerId = resolveChartGroupOwnership([node], grouping).byNode.get(
		node.id,
	)?.groupId;
	if (ownerId) {
		groupIds.add(ownerId);
		const group = grouping.groups.find(
			(candidate) => candidate.id === ownerId,
		);
		if (group?.name) {
			groupNames.add(group.name);
		}
	}

	return {
		groupIds: [...groupIds],
		groupNames: [...groupNames],
	};
}
