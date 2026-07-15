import type { ChartGroupingConfig, KnowledgeNode, NodeId } from '../core/types';
import { nodeMatchesFilterGroup } from './filters';

export type ChartGroupOwnershipSource = 'override' | 'rule' | 'none';

export interface ChartGroupOwnershipEntry {
	nodeId: NodeId;
	groupId?: string;
	source: ChartGroupOwnershipSource;
	matchedGroupIds: string[];
	conflictingGroupIds: string[];
}

export interface ChartGroupConflict {
	nodeId: NodeId;
	ownerGroupId?: string;
	groupIds: string[];
}

export interface ChartGroupOwnership {
	byNode: Map<NodeId, ChartGroupOwnershipEntry>;
	membersByGroup: Map<string, NodeId[]>;
	ungroupedNodeIds: NodeId[];
	conflicts: ChartGroupConflict[];
}

export function resolveChartGroupOwnership(
	nodes: readonly KnowledgeNode[],
	grouping: ChartGroupingConfig,
): ChartGroupOwnership {
	const groupsById = new Map(
		grouping.groups.map((group) => [group.id, group] as const),
	);
	const membersByGroup = new Map(
		grouping.groups.map((group) => [group.id, [] as NodeId[]] as const),
	);
	const byNode = new Map<NodeId, ChartGroupOwnershipEntry>();
	const ungroupedNodeIds: NodeId[] = [];
	const conflicts: ChartGroupConflict[] = [];

	for (const node of nodes) {
		const matchedGroupIds = grouping.groups
			.filter((group) => groupRuleMatchesNode(node, group))
			.map((group) => group.id);
		const hasOverride = Object.prototype.hasOwnProperty.call(
			grouping.overrides,
			node.id,
		);
		const override = grouping.overrides[node.id];
		const validOverride =
			typeof override === 'string' && groupsById.has(override)
				? override
				: undefined;
		const explicitUngrouped = hasOverride && override === null;
		const groupId = explicitUngrouped
			? undefined
			: (validOverride ?? matchedGroupIds[0]);
		const source: ChartGroupOwnershipSource =
			explicitUngrouped || validOverride
				? 'override'
				: groupId
					? 'rule'
					: 'none';
		const conflictingGroupIds = Array.from(
			new Set([
				...(validOverride ? [validOverride] : []),
				...matchedGroupIds,
			]),
		);
		const entry: ChartGroupOwnershipEntry = {
			nodeId: node.id,
			...(groupId ? { groupId } : {}),
			source,
			matchedGroupIds,
			conflictingGroupIds,
		};
		byNode.set(node.id, entry);

		if (groupId) {
			membersByGroup.get(groupId)?.push(node.id);
		} else {
			ungroupedNodeIds.push(node.id);
		}
		if (conflictingGroupIds.length > 1) {
			conflicts.push({
				nodeId: node.id,
				...(groupId ? { ownerGroupId: groupId } : {}),
				groupIds: conflictingGroupIds,
			});
		}
	}

	return { byNode, membersByGroup, ungroupedNodeIds, conflicts };
}

function groupRuleMatchesNode(
	node: KnowledgeNode,
	group: ChartGroupingConfig['groups'][number],
): boolean {
	return (
		group.mode === 'rule' &&
		Boolean(group.rule?.children.length) &&
		group.rule !== undefined &&
		nodeMatchesFilterGroup(node, group.rule)
	);
}
