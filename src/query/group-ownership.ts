import type { ChartGroupingConfig, KnowledgeNode, NodeId } from '@/core/types';
import { nodeMatchesFilterGroup } from '@/query/filters';

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
			typeof override === 'string' &&
			groupsById.has(override) &&
			(matchedGroupIds.length > 0
				? matchedGroupIds.includes(override)
				: groupsById.get(override)?.mode !== 'rule')
				? override
				: undefined;
		const explicitUngrouped =
			hasOverride && override === null && matchedGroupIds.length === 0;
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

export function createChartGroupByNode(
	nodes: readonly KnowledgeNode[],
	grouping: ChartGroupingConfig,
): Map<NodeId, string> {
	const ownership = resolveChartGroupOwnership(nodes, grouping);
	return new Map(
		[...ownership.byNode].flatMap(([nodeId, entry]) =>
			entry.groupId ? [[nodeId, entry.groupId]] : [],
		),
	);
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

/** Manual destinations, or matching rules when membership is ambiguous. */
export function getGroupMoveTargets(
	node: KnowledgeNode | undefined,
	groups: ChartGroupingConfig['groups'],
): ChartGroupingConfig['groups'] {
	const matches = node
		? groups.filter((group) => groupRuleMatchesNode(node, group))
		: [];
	return matches.length > 0
		? matches.length > 1
			? matches
			: []
		: groups.filter((group) => group.mode !== 'rule');
}

export function canMoveNodeToGroup(
	node: KnowledgeNode | undefined,
	groups: ChartGroupingConfig['groups'],
	groupId: string | null,
): boolean {
	if (groupId === null)
		return (
			!node || !groups.some((group) => groupRuleMatchesNode(node, group))
		);
	return getGroupMoveTargets(node, groups).some(
		(group) => group.id === groupId,
	);
}

/** Drop incompatible saved assignments; preserve valid rule conflict choices. */
export function cleanGroupingOverrides(
	grouping: ChartGroupingConfig,
	nodes: ReadonlyMap<string, KnowledgeNode>,
): ChartGroupingConfig {
	const overrides = { ...grouping.overrides };
	let changed = false;
	for (const [id, target] of Object.entries(overrides)) {
		const node = nodes.get(id);
		if (!node) continue;
		if (!canMoveNodeToGroup(node, grouping.groups, target)) {
			delete overrides[id];
			changed = true;
		}
	}
	return changed ? { ...grouping, overrides } : grouping;
}
