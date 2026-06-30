import type {
	GraphQuery,
	NodeFilterGroup,
	NodeFilterItem,
	NodeFilterOperator,
} from '../../core/types';

export type FilterScope = 'global' | 'current';

export function createDefaultFilterRoot(): NodeFilterGroup {
	return {
		id: 'root',
		kind: 'group',
		mode: 'all',
		children: [],
	};
}

export function getScopedFilterRoot(
	scope: FilterScope,
	query: GraphQuery,
	globalQuery: GraphQuery,
): NodeFilterGroup {
	return (
		(scope === 'global' ? globalQuery.filterRoot : query.filterRoot) ??
		createDefaultFilterRoot()
	);
}

export function addFilterConditionToGroup(
	root: NodeFilterGroup,
	groupId: string,
	id: string,
): NodeFilterGroup {
	return updateFilterGroup(root, groupId, (group) => ({
		...group,
		children: [
			...group.children,
			{
				id,
				kind: 'condition',
				field: 'file.links',
				operator: 'has-value',
				value: '',
			},
		],
	}));
}

export function addFilterGroupToGroup(
	root: NodeFilterGroup,
	groupId: string,
	id: string,
): NodeFilterGroup {
	return updateFilterGroup(root, groupId, (group) => ({
		...group,
		children: [
			...group.children,
			{
				id,
				kind: 'group',
				mode: 'all',
				children: [],
			},
		],
	}));
}

export function updateFilterGroup(
	root: NodeFilterGroup,
	groupId: string,
	update: (group: NodeFilterGroup) => NodeFilterGroup,
): NodeFilterGroup {
	if (root.id === groupId) {
		return update(root);
	}
	return {
		...root,
		children: root.children.map((child) =>
			child.kind === 'group'
				? updateFilterGroup(child, groupId, update)
				: child,
		),
	};
}

export function patchFilterItem(
	item: NodeFilterItem,
	itemId: string,
	patch: Partial<NodeFilterItem>,
): NodeFilterItem {
	if (item.id === itemId) {
		return { ...item, ...patch } as NodeFilterItem;
	}
	if (item.kind === 'group') {
		return {
			...item,
			children: item.children.map((child) =>
				patchFilterItem(child, itemId, patch),
			),
		};
	}
	return item;
}

export function removeFilterItemFromGroup(
	group: NodeFilterGroup,
	itemId: string,
): NodeFilterGroup {
	return {
		...group,
		children: group.children
			.filter((child) => child.id !== itemId)
			.map((child) =>
				child.kind === 'group'
					? removeFilterItemFromGroup(child, itemId)
					: child,
			),
	};
}

export function shouldShowFilterValue(
	operator: NodeFilterOperator | undefined,
): boolean {
	return operator !== 'has-value' && operator !== 'empty';
}

export function createRuleId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
