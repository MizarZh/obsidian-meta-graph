import { describe, expect, it } from 'vitest';
import type {
	ChartGroupDefinition,
	ChartGroupingConfig,
	KnowledgeNode,
	NodeFilterGroup,
} from '@/core/types';
import {
	getGroupMoveTargets,
	canMoveNodeToGroup,
	cleanGroupingOverrides,
	resolveChartGroupOwnership,
} from '@/query/group-ownership';

describe('chart group ownership', () => {
	it('uses group order for overlapping rules and reports the conflict', () => {
		const grouping = createGrouping([
			ruleGroup('research', tagRule('research')),
			ruleGroup('projects', folderRule('Projects')),
		]);
		const result = resolveChartGroupOwnership(
			[node('Projects/A.md', ['research'])],
			grouping,
		);

		expect(result.byNode.get('Projects/A.md')).toEqual({
			nodeId: 'Projects/A.md',
			groupId: 'research',
			source: 'rule',
			matchedGroupIds: ['research', 'projects'],
			conflictingGroupIds: ['research', 'projects'],
		});
		expect(result.conflicts).toEqual([
			{
				nodeId: 'Projects/A.md',
				ownerGroupId: 'research',
				groupIds: ['research', 'projects'],
			},
		]);
	});

	it('rejects incompatible overrides and preserves matching conflict choices', () => {
		const groups = [
			manualGroup('manual'),
			ruleGroup('research', tagRule('research')),
			ruleGroup('projects', folderRule('Projects')),
		];
		const nodes = [
			node('A.md', ['research']),
			node('B.md', ['research']),
			node('C.md'),
			node('Projects/D.md', ['research']),
			node('E.md'),
		];
		const grouping = createGrouping(groups, {
			'A.md': 'manual',
			'B.md': null,
			'C.md': 'research',
			'Projects/D.md': 'projects',
			'E.md': 'manual',
		});
		const result = resolveChartGroupOwnership(nodes, grouping);
		expect(result.byNode.get('A.md')).toMatchObject({
			groupId: 'research',
			source: 'rule',
		});
		expect(result.byNode.get('B.md')).toMatchObject({
			groupId: 'research',
			source: 'rule',
		});
		expect(result.byNode.get('C.md')?.groupId).toBeUndefined();
		expect(result.byNode.get('Projects/D.md')).toMatchObject({
			groupId: 'projects',
			source: 'override',
		});
		const cleaned = cleanGroupingOverrides(
			grouping,
			new Map(nodes.map((n) => [n.id, n])),
		);
		expect(cleaned.overrides).toEqual({
			'Projects/D.md': 'projects',
			'E.md': 'manual',
		});
		expect(
			cleanGroupingOverrides(
				cleaned,
				new Map(nodes.map((n) => [n.id, n])),
			),
		).toBe(cleaned);
	});

	it('offers manual groups or only overlapping matching rules', () => {
		const groups = [
			manualGroup('manual'),
			ruleGroup('research', tagRule('research')),
			ruleGroup('projects', folderRule('Projects')),
		];
		const single = node('A.md', ['research']);
		const conflict = node('Projects/A.md', ['research']);
		expect(getGroupMoveTargets(single, groups)).toEqual([]);
		expect(getGroupMoveTargets(conflict, groups).map((g) => g.id)).toEqual([
			'research',
			'projects',
		]);
		expect(
			getGroupMoveTargets(node('B.md'), groups).map((g) => g.id),
		).toEqual(['manual']);
		expect(getGroupMoveTargets(node('B.md'), groups.slice(1))).toEqual([]);
		expect(canMoveNodeToGroup(single, groups, null)).toBe(false);
		expect(canMoveNodeToGroup(conflict, groups, 'manual')).toBe(false);
		expect(canMoveNodeToGroup(conflict, groups, 'projects')).toBe(true);
	});

	it('treats empty rules as matching no nodes', () => {
		const grouping = createGrouping([
			ruleGroup('empty', {
				id: 'root',
				kind: 'group',
				mode: 'all',
				children: [],
			}),
		]);
		const result = resolveChartGroupOwnership([node('A.md')], grouping);

		expect(result.byNode.get('A.md')).toMatchObject({ source: 'none' });
		expect(result.membersByGroup.get('empty')).toEqual([]);
		expect(result.ungroupedNodeIds).toEqual(['A.md']);
	});

	it('ignores overrides that reference deleted groups', () => {
		const grouping = createGrouping(
			[ruleGroup('research', tagRule('research'))],
			{ 'A.md': 'deleted' },
		);
		const result = resolveChartGroupOwnership(
			[node('A.md', ['research'])],
			grouping,
		);

		expect(result.byNode.get('A.md')).toMatchObject({
			groupId: 'research',
			source: 'rule',
		});
	});
});

function createGrouping(
	groups: ChartGroupDefinition[],
	overrides: ChartGroupingConfig['overrides'] = {},
): ChartGroupingConfig {
	return { groups, overrides };
}

function manualGroup(id: string): ChartGroupDefinition {
	return { id, name: id, color: '#7c6ff0', mode: 'manual', padding: 0.32 };
}

function ruleGroup(id: string, rule: NodeFilterGroup): ChartGroupDefinition {
	return { ...manualGroup(id), mode: 'rule', rule };
}

function tagRule(tag: string): NodeFilterGroup {
	return conditionRule('file.tags', tag);
}

function folderRule(folder: string): NodeFilterGroup {
	return conditionRule('file.folder', folder);
}

function conditionRule(
	field: 'file.tags' | 'file.folder',
	value: string,
): NodeFilterGroup {
	return {
		id: 'root',
		kind: 'group',
		mode: 'all',
		children: [
			{
				id: `${field}-${value}`,
				kind: 'condition',
				field,
				operator: 'is',
				value,
			},
		],
	};
}

function node(path: string, tags: string[] = []): KnowledgeNode {
	return {
		id: path,
		path,
		title: path.replace(/\.md$/u, ''),
		folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
		domains: [],
		tags,
	};
}
