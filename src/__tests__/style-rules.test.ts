import { describe, expect, it } from 'vitest';
import type {
	KnowledgeEdge,
	KnowledgeNode,
	LinkStyleRule,
	NodeStyleRule,
} from '../core/types';
import { resolveLinkStyle, resolveNodeStyle } from '../graph/style-rules';
import { createWorkspaceState } from '../workspace/workspace-state';

const node: KnowledgeNode = {
	id: 'science/Star.md',
	path: 'science/Star.md',
	title: 'Star',
	folder: 'science',
	domains: ['astronomy'],
	tags: ['important'],
	noteType: 'concept',
};

const edge: KnowledgeEdge = {
	id: 'edge',
	source: 'A.md',
	target: 'B.md',
	relation: 'leads-to',
	directed: true,
	sourcePath: 'A.md',
	sourceField: 'leads-to',
};

describe('style rules', () => {
	it('defines separate Graph and Flow defaults for related links', () => {
		const state = createWorkspaceState(200);
		expect(state.graphLinkStyleRules).toEqual([
			expect.objectContaining({
				field: 'relation',
				value: 'related',
				hidden: false,
			}),
		]);
		expect(state.flowLinkStyleRules).toEqual([
			expect.objectContaining({
				field: 'relation',
				value: 'related',
				hidden: true,
			}),
		]);
	});

	it('applies matching node rules in order', () => {
		const rules: NodeStyleRule[] = [
			{
				id: 'folder',
				field: 'folder',
				value: 'science',
				color: '#111111',
				size: 8,
			},
			{
				id: 'tag',
				field: 'tag',
				value: 'important',
				color: '#222222',
				size: 12,
			},
		];
		expect(
			resolveNodeStyle(node, rules, { color: '#000000', size: 7 }),
		).toEqual({ color: '#222222', size: 12 });
	});

	it('matches link relation and frontmatter field', () => {
		const rules: LinkStyleRule[] = [
			{
				id: 'relation',
				field: 'relation',
				value: 'leads-to',
				color: '#333333',
				size: 2,
				label: 'Next',
				hidden: false,
			},
			{
				id: 'field',
				field: 'source-field',
				value: 'leads-to',
				color: '#444444',
				size: 3,
				label: 'Flow',
				hidden: true,
			},
		];
		expect(
			resolveLinkStyle(edge, rules, {
				color: '#000000',
				size: 1,
				label: '',
				hidden: false,
			}),
		).toEqual({
			color: '#444444',
			size: 3,
			label: 'Flow',
			hidden: true,
		});
	});

	it('uses the same default link color for every relation', () => {
		const prerequisiteEdge = {
			...edge,
			relation: 'prerequisite' as const,
		};
		const defaults = {
			color: '#888888',
			size: 1.5,
			label: '',
			hidden: false,
		};
		expect(resolveLinkStyle(edge, [], defaults)).toEqual(defaults);
		expect(resolveLinkStyle(prerequisiteEdge, [], defaults)).toEqual(defaults);
	});
});
