import { createDefaultFilterRoot } from '@/ui/filter/filter-tree';
import type {
	ChartGroupDefinition,
	CuratedWorkspaceConfig,
	KnowledgeNode,
	ManualLayoutConfig,
	NodeFilterGroup,
} from '@/core/types';

export type ReorderPlacement = 'before' | 'after';
export type ConditionalMode = 'add' | 'remove' | 'select';

export interface CuratedConditionDraft {
	mode: ConditionalMode;
	filterRoot: NodeFilterGroup;
	resultSearch: string;
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

export function createCuratedConditionDraft(): CuratedConditionDraft {
	return {
		mode: 'add',
		filterRoot: createDefaultFilterRoot(),
		resultSearch: '',
	};
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
	groupsById: Map<string, ChartGroupDefinition>,
	nodeColors: Map<string, string>,
	selected: Set<string>,
	resolvedGroupIds?: ReadonlyMap<string, string | undefined>,
): CuratedFileEntry[] {
	return curated.files.map((file) => {
		const node = nodesByPath.get(file.path);
		const groupId = resolvedGroupIds
			? resolvedGroupIds.get(file.path)
			: manualLayout.nodes[file.path]?.groupId;
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

export function readPointerPlacement(
	targetEl: HTMLElement,
	clientY: number,
): ReorderPlacement {
	const rect = targetEl.getBoundingClientRect();
	return clientY > rect.top + rect.height / 2 ? 'after' : 'before';
}
