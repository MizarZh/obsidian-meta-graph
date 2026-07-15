import { describe, expect, it } from 'vitest';
import type {
	ChartGroupDefinition,
	ChartGroupingConfig,
	KnowledgeNode,
	NodeFilterGroup,
} from '../core/types';
import { resolveChartGroupOwnership } from '../query/group-ownership';

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

	it('lets explicit groups and ungrouped overrides win over rules', () => {
		const grouping = createGrouping(
			[manualGroup('manual'), ruleGroup('research', tagRule('research'))],
			{
				'A.md': 'manual',
				'B.md': null,
			},
		);
		const result = resolveChartGroupOwnership(
			[node('A.md', ['research']), node('B.md', ['research'])],
			grouping,
		);

		expect(result.byNode.get('A.md')).toMatchObject({
			groupId: 'manual',
			source: 'override',
			matchedGroupIds: ['research'],
			conflictingGroupIds: ['manual', 'research'],
		});
		expect(result.byNode.get('B.md')).toEqual({
			nodeId: 'B.md',
			source: 'override',
			matchedGroupIds: ['research'],
			conflictingGroupIds: ['research'],
		});
		expect(result.ungroupedNodeIds).toEqual(['B.md']);
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
