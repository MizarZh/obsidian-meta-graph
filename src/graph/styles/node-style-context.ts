import type { KnowledgeNode, ManualLayoutConfig } from '../../core/types';
import { nodeMatchesFilterGroup } from '../../query/filters';
import type { NodeStyleContext } from './style-rules';

export function resolveNodeStyleContext(
	node: KnowledgeNode,
	manualLayout: ManualLayoutConfig,
): NodeStyleContext {
	const groupIds = new Set<string>();
	const groupNames = new Set<string>();
	const groupsById = new Map(
		manualLayout.groups.map((group) => [group.id, group]),
	);
	const placement =
		manualLayout.nodes[node.id] ?? manualLayout.nodes[node.path];

	if (placement?.groupId) {
		const group = groupsById.get(placement.groupId);
		groupIds.add(placement.groupId);
		if (group?.name) {
			groupNames.add(group.name);
		}
	}

	for (const group of manualLayout.groups) {
		if (
			group.mode === 'rule' &&
			group.rule &&
			nodeMatchesFilterGroup(node, group.rule)
		) {
			groupIds.add(group.id);
			if (group.name) {
				groupNames.add(group.name);
			}
		}
	}

	return {
		groupIds: [...groupIds],
		groupNames: [...groupNames],
	};
}
