import type {
	ChartGroupDefinition,
	GraphProjection,
	ManualLayoutConfig,
} from '@/core/types';

export interface NodeListEntry {
	id: string;
	path: string;
	title: string;
	detail: string;
	missing: boolean;
	unresolved?: boolean;
	color?: string;
	groupId: string;
	groupName: string;
	groupColor?: string;
	missingGroup: boolean;
	hidden: boolean;
}

export function buildQueryNodeListEntries(
	projection: GraphProjection | undefined,
	manualLayout: ManualLayoutConfig,
	groupsById: ReadonlyMap<string, ChartGroupDefinition>,
	nodeColors: ReadonlyMap<string, string>,
	resolvedGroupIds?: ReadonlyMap<string, string | undefined>,
): NodeListEntry[] {
	return (projection?.nodes ?? []).map((node) => {
		const groupId = resolvedGroupIds
			? resolvedGroupIds.get(node.id)
			: manualLayout.nodes[node.id]?.groupId;
		const group = groupId ? groupsById.get(groupId) : undefined;
		return {
			id: node.id,
			path: node.path,
			title: node.title,
			detail: node.path,
			missing: false,
			unresolved: node.kind === 'unresolved',
			color: nodeColors.get(node.path),
			groupId: groupId ?? '',
			groupName: group?.name ?? (groupId ? 'Missing group' : 'No group'),
			groupColor: group?.color,
			missingGroup: Boolean(groupId && !group),
			hidden: projection?.hiddenNodeIds?.has(node.id) ?? false,
		};
	});
}

export function retainNodeListSelection(
	selected: Set<string>,
	memberIds: ReadonlySet<string>,
): Set<string> {
	if ([...selected].every((id) => memberIds.has(id))) return selected;
	return new Set([...selected].filter((id) => memberIds.has(id)));
}
