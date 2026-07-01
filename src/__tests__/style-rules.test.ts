import { describe, expect, it } from 'vitest';
import type {
	KnowledgeEdge,
	KnowledgeNode,
	LinkStyleRule,
	NodeStyleRule,
} from '../core/types';
import {
	resolveLinkStyle,
	resolveNodeStyle,
} from '../graph/styles/style-rules';
import { resolveNodeStyleContext } from '../graph/styles/node-style-context';
import { normalizeMetaGraphDocument } from '../workspace/meta-graph-model';
import { createWorkspaceState } from '../workspace/state/workspace-state';

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
	it('starts charts with workspace defaults and empty chart overrides', () => {
		const state = createWorkspaceState(200);
		expect(state.defaultNodeStyle).toEqual({ color: '#7c6ff0', size: 7 });
		expect(state.defaultLinkStyle).toEqual({
			color: '#888888',
			size: 1.5,
			lineStyle: 'solid',
			label: '',
			showLabel: false,
			hidden: false,
		});
		expect(state.nodeStyleOverrides).toEqual({});
		expect(state.linkStyleOverrides).toEqual({});
		expect(state.nodeStyleRules).toEqual([]);
		expect(state.linkStyleRules).toEqual([]);
		expect(state.charts.map((chart) => chart.type)).toEqual([
			'graph',
			'flow',
			'arc',
		]);
	});

	it('migrates legacy all style rules to defaults and overrides', () => {
		const document = normalizeMetaGraphDocument(
			{
				globalQuery: {
					roots: [],
					direction: 'both',
					depth: 2,
					relations: ['leads-to'],
					includeTags: [],
					excludeTags: [],
					folders: [],
					maxNodes: 200,
					hiddenNodeRules: [],
					filterRoot: {
						id: 'root',
						kind: 'group',
						mode: 'all',
						children: [],
					},
				},
				globalStyle: {
					nodeRules: [
						{
							id: 'all',
							field: 'all',
							value: '',
							color: '#111111',
							size: 9,
						},
					],
					linkRules: [],
				},
				charts: [
					{
						id: 'chart',
						name: 'Chart',
						type: 'graph',
						source: 'query',
						query: {
							roots: [],
							direction: 'both',
							depth: 2,
							relations: ['leads-to'],
							includeTags: [],
							excludeTags: [],
							folders: [],
							maxNodes: 200,
							hiddenNodeRules: [],
							filterRoot: {
								id: 'root',
								kind: 'group',
								mode: 'all',
								children: [],
							},
						},
						curated: {
							files: [],
							context: {
								enabled: false,
								depth: 0,
								includeOutgoingLinks: true,
								includeBacklinks: true,
								includeMetadataRelations: true,
							},
						},
						layout: { engine: 'force-atlas', spacing: 1 },
						display: {
							fadeDistance: 1.5,
							labelSize: 14,
							labelPosition: 'right',
							labelColor: '',
							labelBackgroundOpacity: 0.82,
							labelDensity: 0.8,
							forceLabels: false,
							enableForceLayout: false,
							showInspector: true,
							showFilters: true,
						},
						style: {
							nodeRules: [
								{
									id: 'all',
									field: 'all',
									value: '',
									color: '#222222',
									size: 9,
								},
								{
									id: 'tag',
									field: 'tag',
									value: 'important',
									color: '#333333',
									size: 12,
								},
							],
							linkRules: [],
						},
					},
				],
				activeChart: 'chart',
				connectionFields: ['leads-to'],
				connectionFieldSpecs: [
					{
						id: 'leads-to:directed',
						field: 'leads-to',
						mode: 'directed',
					},
				],
				connectionFieldModes: { 'leads-to': 'directed' },
				activeConnectionFieldSpecId: 'leads-to:directed',
				activeConnectionField: 'leads-to',
				dock: {
					templates: [],
					notes: [],
					dockWidth: 280,
					curatedPanelWidth: 300,
					focusOnSelect: true,
				},
			},
			200,
			1.5,
		);
		const state = createWorkspaceState(200, 1.5, document);

		expect(state.defaultNodeStyle).toEqual({ color: '#111111', size: 9 });
		expect(state.nodeStyleOverrides).toEqual({ color: '#222222' });
		expect(state.nodeStyleRules).toHaveLength(1);
		expect(state.nodeStyleRules[0]?.field).toBe('tag');
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

	it('matches node style rules by chart group', () => {
		const rules: NodeStyleRule[] = [
			{
				id: 'group',
				field: 'group',
				value: 'research',
				color: '#555555',
				size: 10,
			},
			{
				id: 'group-name',
				field: 'group',
				value: 'Priority',
				color: '#666666',
				size: 12,
			},
		];

		expect(
			resolveNodeStyle(
				node,
				rules,
				{ color: '#000000', size: 7 },
				{ groupIds: ['research'], groupNames: ['Priority'] },
			),
		).toEqual({ color: '#666666', size: 12 });
	});

	it('resolves node style context from manual and rule groups', () => {
		expect(
			resolveNodeStyleContext(node, {
				nodes: {
					[node.id]: { x: 0, y: 0, groupId: 'manual-group' },
				},
				groups: [
					{
						id: 'manual-group',
						name: 'Manual group',
						x: 0,
						y: 0,
						width: 1,
						height: 1,
						color: '#111111',
						mode: 'manual',
						padding: 0.1,
					},
					{
						id: 'rule-group',
						name: 'Rule group',
						x: 0,
						y: 0,
						width: 1,
						height: 1,
						color: '#222222',
						mode: 'rule',
						padding: 0.1,
						rule: {
							id: 'root',
							kind: 'group',
							mode: 'all',
							children: [
								{
									id: 'tag',
									kind: 'condition',
									field: 'tag',
									operator: 'is',
									value: 'important',
								},
							],
						},
					},
				],
			}),
		).toEqual({
			groupIds: ['manual-group', 'rule-group'],
			groupNames: ['Manual group', 'Rule group'],
		});
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
		expect(resolveLinkStyle(prerequisiteEdge, [], defaults)).toEqual(
			defaults,
		);
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
