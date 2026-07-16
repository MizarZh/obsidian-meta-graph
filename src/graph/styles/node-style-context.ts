import type {
	ChartGroupingConfig,
	KnowledgeNode,
	ManualLayoutConfig,
} from '../../core/types';
import { resolveChartGroupOwnership } from '../../query/group-ownership';
import type { NodeStyleContext } from './style-rules';

export function resolveNodeStyleContext(
	node: KnowledgeNode,
	grouping: ChartGroupingConfig,
	manualLayout: ManualLayoutConfig,
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
	} else {
		const placement =
			manualLayout.nodes[node.id] ?? manualLayout.nodes[node.path];
		const cubeGroup = placement?.groupId
			? manualLayout.groups.find(
					(group) => group.id === placement.groupId,
				)
			: undefined;
		if (placement?.groupId) {
			groupIds.add(placement.groupId);
		}
		if (cubeGroup?.name) {
			groupNames.add(cubeGroup.name);
		}
	}

	return {
		groupIds: [...groupIds],
		groupNames: [...groupNames],
	};
}
