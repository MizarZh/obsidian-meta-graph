import type {
	ChartGroup,
	CuratedWorkspaceConfig,
	KnowledgeNode,
	ManualLayoutConfig,
	NodeFilterGroup,
	NodeFilterItem,
} from '../../core/types';
import { nodeMatchesFilterGroup } from '../../query/filters';

export type ReorderPlacement = 'before' | 'after';
export type ConditionalMode = 'add' | 'remove' | 'select';

export interface CuratedConditionDraft {
	mode: ConditionalMode;
	filterRoot: NodeFilterGroup;
	resultSearch: string;
}

interface SuggestionOption {
	value: string;
	label: string;
	detail?: string;
	searchText?: string;
}

export interface CuratedFileEntry {
	path: string;
	title: string;
	detail: string;
	missing: boolean;
	color?: string;
	groupId: string;
	groupName: string;
	groupColor?: string;
	missingGroup: boolean;
	hidden: boolean;
	selected: boolean;
}

export function createConditionFilterRoot(): NodeFilterGroup {
	return {
		id: 'root',
		kind: 'group',
		mode: 'all',
		children: [],
	};
}

export function createCuratedConditionDraft(): CuratedConditionDraft {
	return {
		mode: 'add',
		filterRoot: createConditionFilterRoot(),
		resultSearch: '',
	};
}

export function createRuleId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function formatFileTitle(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/u, '') ?? path;
}

export function countTitles<T extends { title: string }>(
	items: T[],
): Record<string, number> {
	return items.reduce<Record<string, number>>((acc, item) => {
		acc[item.title] = (acc[item.title] ?? 0) + 1;
		return acc;
	}, {});
}

export function buildTitleIndex(
	nodes: KnowledgeNode[],
): Map<string, KnowledgeNode[]> {
	const index = new Map<string, KnowledgeNode[]>();
	for (const node of nodes) {
		const keys = [
			node.title,
			node.path.replace(/\.md$/u, ''),
			...(node.aliases ?? []),
		];
		for (const key of keys) {
			const normalized = key.trim().toLocaleLowerCase();
			if (!normalized) {
				continue;
			}
			index.set(normalized, [...(index.get(normalized) ?? []), node]);
		}
	}
	return index;
}

export function buildSelectedCuratedFiles(
	curated: CuratedWorkspaceConfig,
	nodesByPath: Map<string, KnowledgeNode>,
	manualLayout: ManualLayoutConfig,
	groupsById: Map<string, ChartGroup>,
	nodeColors: Map<string, string>,
	selected: Set<string>,
): CuratedFileEntry[] {
	return curated.files.map((file) => {
		const node = nodesByPath.get(file.path);
		const groupId = manualLayout.nodes[file.path]?.groupId;
		const group = groupId ? groupsById.get(groupId) : undefined;
		return {
			path: file.path,
			title: node?.title ?? formatFileTitle(file.path),
			detail: file.path,
			missing: !node,
			color: node ? nodeColors.get(node.path) : undefined,
			groupId: groupId ?? '',
			groupName: group?.name ?? (groupId ? 'Missing group' : 'No group'),
			groupColor: group?.color,
			missingGroup: Boolean(groupId && !group),
			hidden: Boolean(file.hidden),
			selected: selected.has(file.path),
		};
	});
}

export function buildFileOptions(
	nodes: KnowledgeNode[],
	workspaceFilePath: string | undefined,
	selectedPaths: Set<string>,
	availableTitleCounts: Record<string, number>,
): SuggestionOption[] {
	return nodes
		.filter(
			(node) =>
				node.path !== workspaceFilePath &&
				!selectedPaths.has(node.path),
		)
		.map((node) => ({
			value: node.path,
			label:
				(availableTitleCounts[node.title] ?? 0) > 1
					? `${node.folder}/${node.title}`
					: node.title,
			detail: node.path,
			searchText: [node.title, node.path, ...(node.aliases ?? [])].join(
				' ',
			),
		}));
}

export function resolveBatchLine(
	line: string,
	nodesByPath: Map<string, KnowledgeNode>,
	titleIndex: Map<string, KnowledgeNode[]>,
): string | undefined {
	const wikilink = line.match(/^\[\[([^|\]]+)(?:\|[^\]]+)?\]\]$/u);
	const value = (wikilink?.[1] ?? line).trim();
	const exact = nodesByPath.get(value) ?? nodesByPath.get(`${value}.md`);
	if (exact) {
		return exact.path;
	}
	const matches = titleIndex.get(value.toLocaleLowerCase()) ?? [];
	return matches.length === 1 ? matches[0]?.path : undefined;
}

export function parseBatchInput(
	input: string,
	nodesByPath: Map<string, KnowledgeNode>,
	titleIndex: Map<string, KnowledgeNode[]>,
	selectedPaths: Set<string>,
): {
	uniquePaths: string[];
	skipped: number;
	unresolved: string[];
	lineCount: number;
} {
	const lines = input
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean);
	const paths: string[] = [];
	const unresolved: string[] = [];
	for (const line of lines) {
		const resolved = resolveBatchLine(line, nodesByPath, titleIndex);
		if (resolved) {
			paths.push(resolved);
		} else {
			unresolved.push(line);
		}
	}
	const uniquePaths = [...new Set(paths)].filter(
		(path) => !selectedPaths.has(path),
	);
	return {
		uniquePaths,
		unresolved,
		lineCount: lines.length,
		skipped: lines.length - uniquePaths.length - unresolved.length,
	};
}

export function getConditionalMatches(
	nodes: KnowledgeNode[],
	selectedPaths: Set<string>,
	workspaceFilePath: string | undefined,
	mode: ConditionalMode,
	root: NodeFilterGroup,
): KnowledgeNode[] {
	const pool =
		mode === 'add'
			? nodes.filter((node) => node.path !== workspaceFilePath)
			: nodes.filter((node) => selectedPaths.has(node.path));
	return pool
		.filter((node) => nodeMatchesFilterGroup(node, root))
		.sort((first, second) =>
			first.title.localeCompare(second.title, undefined, {
				sensitivity: 'base',
			}),
		);
}

export function filterConditionalMatches(
	matches: KnowledgeNode[],
	search: string,
): KnowledgeNode[] {
	const query = search.trim().toLocaleLowerCase();
	if (!query) {
		return matches;
	}
	return matches.filter((node) =>
		[node.title, node.path, node.folder, ...(node.aliases ?? [])]
			.join(' ')
			.toLocaleLowerCase()
			.includes(query),
	);
}

export function canApplyConditionToPath(
	path: string,
	mode: ConditionalMode,
	selectedPaths: Set<string>,
): boolean {
	if (mode === 'add') {
		return !selectedPaths.has(path);
	}
	return selectedPaths.has(path);
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

export function readPointerPlacement(
	targetEl: HTMLElement,
	clientY: number,
): ReorderPlacement {
	const rect = targetEl.getBoundingClientRect();
	return clientY > rect.top + rect.height / 2 ? 'after' : 'before';
}
