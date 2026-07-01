import { describe, expect, it } from 'vitest';
import type { KnowledgeNode, NodeFilterGroup } from '../core/types';
import {
	canApplyConditionToPath,
	createCuratedConditionDraft,
	getConditionalMatches,
} from '../ui/curated/curated-panel-state';

describe('curated panel state', () => {
	it('limits select mode filter matches to curated files', () => {
		const nodes = [
			createNode('A.md', 'Alpha', ['project']),
			createNode('B.md', 'Beta', ['project']),
			createNode('C.md', 'Gamma', ['archive']),
		];
		const curatedPaths = new Set(['A.md', 'C.md']);

		expect(
			getConditionalMatches(
				nodes,
				curatedPaths,
				'Workspace.md',
				'select',
				tagFilter('project'),
			).map((node) => node.path),
		).toEqual(['A.md']);
		expect(canApplyConditionToPath('A.md', 'select', curatedPaths)).toBe(
			true,
		);
		expect(canApplyConditionToPath('B.md', 'select', curatedPaths)).toBe(
			false,
		);
	});

	it('creates a reusable default condition draft', () => {
		expect(createCuratedConditionDraft()).toEqual({
			mode: 'add',
			resultSearch: '',
			filterRoot: {
				id: 'root',
				kind: 'group',
				mode: 'all',
				children: [],
			},
		});
	});
});

function createNode(
	path: string,
	title: string,
	tags: string[] = [],
): KnowledgeNode {
	return {
		id: path,
		path,
		title,
		folder: '',
		domains: [],
		tags,
	};
}

function tagFilter(tag: string): NodeFilterGroup {
	return {
		id: 'root',
		kind: 'group',
		mode: 'all',
		children: [
			{
				id: 'tag',
				kind: 'condition',
				field: 'tag',
				operator: 'has-tag',
				value: tag,
			},
		],
	};
}
