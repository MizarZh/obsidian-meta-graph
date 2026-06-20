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
	it('starts charts with base style rules', () => {
		const state = createWorkspaceState(200);
		expect(state.nodeStyleRules).toEqual([
			{
				id: 'all',
				field: 'all',
				value: '',
				color: '#7c6ff0',
				size: 7,
			},
		]);
		expect(state.linkStyleRules).toEqual([
			{
				id: 'all',
				field: 'all',
				value: '',
				color: '#888888',
				size: 1.5,
				lineStyle: 'solid',
				label: '',
				showLabel: false,
				hidden: false,
			},
		]);
		expect(state.charts.map((chart) => chart.type)).toEqual([
			'graph',
			'flow',
			'arc',
		]);
	});

	it('uses all rules as the base style layer', () => {
		expect(
			resolveNodeStyle(
				node,
				[
					{
						id: 'all',
						field: 'all',
						value: '',
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
				],
				{ color: '#000000', size: 7 },
			),
		).toEqual({ color: '#222222', size: 12 });

		expect(
			resolveLinkStyle(
				edge,
				[
					{
						id: 'all',
						field: 'all',
						value: '',
						color: '#111111',
						size: 2,
						lineStyle: 'solid',
						label: '',
						showLabel: false,
						hidden: false,
					},
					{
						id: 'relation',
						field: 'relation',
						value: 'leads-to',
						color: '#222222',
						size: 3,
						lineStyle: 'dashed',
						label: 'Next',
						showLabel: true,
						hidden: false,
					},
				],
				{
					color: '#000000',
					size: 1,
					lineStyle: 'solid',
					label: '',
					hidden: false,
				},
			),
		).toEqual({
			color: '#222222',
			size: 3,
			lineStyle: 'dashed',
			label: 'Next',
			hidden: false,
		});
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
				lineStyle: 'dashed',
				label: 'Next',
				showLabel: true,
				hidden: false,
			},
			{
				id: 'field',
				field: 'source-field',
				value: 'leads-to',
				color: '#444444',
				size: 3,
				lineStyle: 'dotted',
				label: 'Flow',
				showLabel: true,
				hidden: true,
			},
		];
		expect(
			resolveLinkStyle(edge, rules, {
				color: '#000000',
				size: 1,
				lineStyle: 'solid',
				label: '',
				hidden: false,
			}),
		).toEqual({
			color: '#444444',
			size: 3,
			lineStyle: 'dotted',
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
			lineStyle: 'solid' as const,
			label: '',
			hidden: false,
		};
		expect(resolveLinkStyle(edge, [], defaults)).toEqual(defaults);
		expect(resolveLinkStyle(prerequisiteEdge, [], defaults)).toEqual(defaults);
	});

	it('uses the relation as the visible label when custom text is empty', () => {
		expect(
			resolveLinkStyle(
				edge,
				[
					{
						id: 'label',
						field: 'relation',
						value: 'leads-to',
						color: '#888888',
						size: 1,
						lineStyle: 'solid',
						label: '',
						showLabel: true,
						hidden: false,
					},
				],
				{
					color: '#888888',
					size: 1,
					lineStyle: 'solid',
					label: '',
					hidden: false,
				},
			),
		).toMatchObject({ label: 'leads-to' });
	});
});
