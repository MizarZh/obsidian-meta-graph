import { describe, expect, it, vi } from 'vitest';
import type { GraphProjection, KnowledgeEdge } from '@/core/types';
import type { GraphPalette } from '@/graph/styles/graph-styles';
import {
	applyBundledFlowEdges,
	createBundledFlowRoutes,
} from '@/layouts/elk-flow-layout';
import {
	createWorkspaceRuntimeGraph,
	prepareWorkspaceRuntimeGraphVisibilityIndex,
	syncWorkspaceRuntimeGraphStyles,
	syncWorkspaceRuntimeGraphVisibility,
} from '@/ui/workspace/runtime-graph';
import { createWorkspaceState } from '@/workspace/state/workspace-state';

const palette: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: 'rgba(0, 0, 0, 0.8)',
};

const projection: GraphProjection = {
	nodes: [
		{
			id: 'A.md',
			path: 'A.md',
			title: 'A',
			folder: '',
			domains: [],
			tags: [],
		},
	],
	edges: [],
	rootIds: new Set(['A.md']),
};

describe('workspace runtime graph', () => {
	it('matches link defaults while preserving independent style overrides', () => {
		const state = createWorkspaceState(200);
		const links: GraphProjection = {
			...projection,
			nodes: [
				...projection.nodes,
				{ ...projection.nodes[0]!, id: 'B.md' },
				{ ...projection.nodes[0]!, id: 'missing', kind: 'unresolved' },
			],
			edges: [
				{
					id: 'plain',
					source: 'A.md',
					target: 'B.md',
					kind: 'plain-link',
					relation: 'link',
					directed: true,
					sourcePath: 'A.md',
					sourceField: 'body',
				},
				{
					id: 'unresolved',
					source: 'A.md',
					target: 'missing',
					kind: 'unresolved-link',
					relation: 'link',
					directed: true,
					sourcePath: 'A.md',
					sourceField: 'body',
				},
			],
		};
		const graph = createWorkspaceRuntimeGraph(
			links,
			new Map(),
			state,
			palette,
		);
		for (const key of [
			'color',
			'size',
			'lineStyle',
			'opacity',
			'arrowStyle',
			'arrowSize',
		] as const) {
			expect(graph.getEdgeAttribute('unresolved', key)).toEqual(
				graph.getEdgeAttribute('plain', key),
			);
		}
		state.plainLinkStyleOverrides = {
			color: '#123456',
			size: 3,
			opacity: 0.4,
			lineStyle: 'solid',
		};
		state.unresolvedLinkStyleOverrides = {
			color: '#abcdef',
			size: 2,
			opacity: 0.7,
			lineStyle: 'dotted',
		};
		syncWorkspaceRuntimeGraphStyles(graph, links, state, palette);
		const rebuilt = createWorkspaceRuntimeGraph(
			links,
			new Map(),
			state,
			palette,
		);
		for (const result of [graph, rebuilt]) {
			expect(result.getEdgeAttributes('plain')).toMatchObject(
				state.plainLinkStyleOverrides,
			);
			expect(result.getEdgeAttributes('unresolved')).toMatchObject(
				state.unresolvedLinkStyleOverrides,
			);
		}
	});

	it('preserves context titles, opacity, and size through style-only updates', () => {
		const state = createWorkspaceState(200);
		const expanded: GraphProjection = {
			...projection,
			nodes: [
				...projection.nodes,
				{ ...projection.nodes[0]!, id: 'B.md', path: 'B.md' },
			],
			contextIds: new Set(['B.md']),
		};
		const graph = createWorkspaceRuntimeGraph(
			expanded,
			new Map(),
			state,
			palette,
		);
		expect(graph.getNodeAttribute('A.md', 'label')).toBe('A');
		expect(graph.getNodeAttribute('B.md', 'label')).toBe('A');
		expect(expanded.nodes[1]?.title).toBe('A');
		expect(graph.getNodeAttribute('B.md', 'opacity')).toBeCloseTo(
			graph.getNodeAttribute('A.md', 'opacity')!,
		);
		expect(graph.getNodeAttribute('B.md', 'size')).toBe(
			graph.getNodeAttribute('A.md', 'size'),
		);
		const next = { ...state, nodeStyleOverrides: { opacity: 0.5 } };
		syncWorkspaceRuntimeGraphStyles(graph, expanded, next, palette);
		const fresh = createWorkspaceRuntimeGraph(
			expanded,
			new Map(),
			next,
			palette,
		);
		expect(graph.getNodeAttribute('B.md', 'label')).toBe('A');
		expect(graph.getNodeAttribute('B.md', 'opacity')).toBeCloseTo(0.5);
		expect(graph.getNodeAttribute('B.md', 'opacity')).toBe(
			fresh.getNodeAttribute('B.md', 'opacity'),
		);
	});

	it.each([
		{ kind: 'relation', directed: true },
		{ kind: 'relation', directed: false },
		{ kind: 'plain-link', directed: true },
		{ kind: 'unresolved-link', directed: true },
		{ semantic: false, directed: true },
	] satisfies Partial<KnowledgeEdge>[])(
		'keeps freshly built and incrementally updated edge styles identical: %j',
		(edgeOptions) => {
			const state = createWorkspaceState(200);
			const styledProjection: GraphProjection = {
				...projection,
				nodes: [
					...projection.nodes,
					{
						...projection.nodes[0]!,
						id: 'B.md',
						path: 'B.md',
						title: 'B',
					},
				],
				edges: [
					{
						id: 'edge',
						source: 'A.md',
						target: 'B.md',
						relation: 'leads-to',
						sourcePath: 'A.md',
						sourceField: 'leads-to',
						...edgeOptions,
					},
				],
				hiddenNodeIds: new Set(['B.md']),
			};
			const graph = createWorkspaceRuntimeGraph(
				styledProjection,
				new Map(),
				state,
				palette,
			);
			const nextState = {
				...state,
				linkStyleOverrides: {
					color: '#ff0000',
					size: 4,
					opacity: 0.3,
					arrowSize: 2,
					arrowStyle: 'chevron' as const,
					showLabel: true,
					label: '',
				},
				plainLinkStyleOverrides: {
					color: '#00ff00',
					size: 5,
					opacity: 0.4,
					arrowSize: 3,
					lineStyle: 'dotted' as const,
					hidden: true,
				},
				unresolvedLinkStyleOverrides: {
					color: '#0000ff',
					size: 6,
					opacity: 0.5,
					arrowSize: 4,
					lineStyle: 'dash-dot' as const,
				},
				linkStyleRules: [
					{
						id: 'rule',
						field: 'all' as const,
						value: '',
						color: '#abcdef',
						size: 7,
						opacity: 0.6,
						arrowSize: 5,
						arrowStyle: 'chevron' as const,
						lineStyle: 'dashed' as const,
						label: 'Next',
						showLabel: true,
						hidden: false,
					},
				],
			};
			const fresh = createWorkspaceRuntimeGraph(
				styledProjection,
				new Map(),
				nextState,
				palette,
			);
			syncWorkspaceRuntimeGraphStyles(
				graph,
				styledProjection,
				nextState,
				palette,
			);
			expect(graph.getEdgeAttributes('edge')).toEqual(
				fresh.getEdgeAttributes('edge'),
			);
			const kind =
				'kind' in edgeOptions ? edgeOptions.kind : 'plain-link';
			expect(graph.getEdgeAttributes('edge')).toMatchObject({
				color:
					kind === 'relation'
						? '#abcdef'
						: kind === 'plain-link'
							? '#00ff00'
							: '#0000ff',
				label: kind === 'relation' ? 'Next' : '',
				forceLabel: kind === 'relation',
				hidden: true,
			});
			// Default labels and blank-color palette fallback must agree too.
			nextState.linkStyleRules = [];
			nextState.linkStyleOverrides.color = '';
			const defaults = createWorkspaceRuntimeGraph(
				styledProjection,
				new Map(),
				nextState,
				palette,
			);
			syncWorkspaceRuntimeGraphStyles(
				graph,
				styledProjection,
				nextState,
				palette,
			);
			expect(graph.getEdgeAttributes('edge')).toEqual(
				defaults.getEdgeAttributes('edge'),
			);
		},
	);

	it('builds a runtime graph with active workspace styles and cached positions', () => {
		const graph = createWorkspaceRuntimeGraph(
			projection,
			new Map([['A.md', { x: 10, y: 20 }]]),
			createWorkspaceState(200),
			palette,
		);

		expect(graph.getNodeAttributes('A.md')).toMatchObject({
			color: '#7c6ff0',
			type: 'circle',
			x: 10,
			y: 20,
			fixed: true,
		});
	});

	it('syncs node shape rules without replacing the runtime graph', () => {
		const state = createWorkspaceState(200);
		const graph = createWorkspaceRuntimeGraph(
			projection,
			new Map(),
			state,
			palette,
		);
		const nextState = {
			...state,
			nodeStyleRules: [
				{
					id: 'shape',
					field: 'all' as const,
					value: '',
					color: '#7c6ff0',
					size: 7,
					shape: 'diamond' as const,
				},
			],
		};

		syncWorkspaceRuntimeGraphStyles(graph, projection, nextState, palette);

		expect(graph.getNodeAttribute('A.md', 'type')).toBe('diamond');
	});

	it('syncs active style changes onto an existing runtime graph', () => {
		const styledProjection: GraphProjection = {
			...projection,
			nodes: [
				...projection.nodes,
				{
					id: 'B.md',
					path: 'B.md',
					title: 'B',
					folder: '',
					domains: [],
					tags: [],
				},
			],
			edges: [
				{
					id: 'A->B',
					source: 'A.md',
					target: 'B.md',
					relation: 'leads-to',
					directed: true,
					sourcePath: 'A.md',
					sourceField: 'leads-to',
				},
			],
		};
		const state = createWorkspaceState(200);
		const graph = createWorkspaceRuntimeGraph(
			styledProjection,
			new Map(),
			state,
			palette,
		);
		const nextState = {
			...state,
			nodeStyleRules: [
				{
					id: 'node',
					field: 'file.basename',
					operator: 'is',
					value: 'A',
					color: '#ff0000',
					size: 11,
				},
			],
			linkStyleRules: [
				{
					id: 'link',
					field: 'relation',
					value: 'leads-to',
					color: '#00ff00',
					size: 3,
					lineStyle: 'dashed',
					label: 'Next',
					showLabel: true,
					hidden: false,
				},
			],
		} satisfies typeof state;

		syncWorkspaceRuntimeGraphStyles(
			graph,
			styledProjection,
			nextState,
			palette,
		);

		expect(graph.getNodeAttributes('A.md')).toMatchObject({
			color: '#ff0000',
			size: 11,
		});
		expect(graph.getEdgeAttributes('A->B')).toMatchObject({
			color: '#00ff00',
			size: 3,
			lineStyle: 'dashed',
			type: 'dashed-arrow',
			label: 'Next',
			forceLabel: true,
		});
	});

	it('keeps bundled labels on target branches during style sync', () => {
		const bundledProjection: GraphProjection = {
			...projection,
			nodes: [
				...projection.nodes,
				{
					id: 'B.md',
					path: 'B.md',
					title: 'B',
					folder: '',
					domains: [],
					tags: [],
				},
				{
					id: 'C.md',
					path: 'C.md',
					title: 'C',
					folder: '',
					domains: [],
					tags: [],
				},
			],
			edges: [
				{
					id: 'A->B',
					source: 'A.md',
					target: 'B.md',
					relation: 'leads-to',
					directed: true,
					sourcePath: 'A.md',
					sourceField: 'leads-to',
				},
				{
					id: 'A->C',
					source: 'A.md',
					target: 'C.md',
					relation: 'leads-to',
					directed: true,
					sourcePath: 'A.md',
					sourceField: 'leads-to',
				},
			],
		};
		const state = createWorkspaceState(200);
		const graph = createWorkspaceRuntimeGraph(
			bundledProjection,
			new Map([
				['A.md', { x: 0, y: 0 }],
				['B.md', { x: 200, y: -60 }],
				['C.md', { x: 200, y: 60 }],
			]),
			state,
			palette,
		);

		applyBundledFlowEdges(
			graph,
			createBundledFlowRoutes(graph, new Map(), 'LR'),
		);
		syncWorkspaceRuntimeGraphStyles(
			graph,
			bundledProjection,
			{
				...state,
				linkStyleRules: [
					{
						id: 'label',
						field: 'relation',
						value: 'leads-to',
						color: '#333333',
						size: 1.5,
						lineStyle: 'solid',
						label: 'Leads to',
						showLabel: true,
						hidden: false,
					},
				],
			},
			palette,
		);

		expect(graph.getEdgeAttribute('A->B__segment_4', 'label')).toBe(
			'Leads to',
		);
		expect(graph.getEdgeAttribute('A->B__segment_3', 'label')).toBe('');
	});

	it('syncs projection hidden nodes without replacing the runtime graph', () => {
		const styledProjection: GraphProjection = {
			...projection,
			nodes: [
				...projection.nodes,
				{
					id: 'B.md',
					path: 'B.md',
					title: 'B',
					folder: '',
					domains: [],
					tags: [],
				},
			],
			edges: [
				{
					id: 'A->B',
					source: 'A.md',
					target: 'B.md',
					relation: 'leads-to',
					directed: true,
					sourcePath: 'A.md',
					sourceField: 'leads-to',
				},
			],
		};
		const state = createWorkspaceState(200);
		const graph = createWorkspaceRuntimeGraph(
			styledProjection,
			new Map(),
			state,
			palette,
		);
		const nodeAttributesUpdated = vi.fn();
		const edgeAttributesUpdated = vi.fn();
		graph.on('nodeAttributesUpdated', nodeAttributesUpdated);
		graph.on('edgeAttributesUpdated', edgeAttributesUpdated);

		prepareWorkspaceRuntimeGraphVisibilityIndex(graph);
		const hiddenChanges = syncWorkspaceRuntimeGraphVisibility(
			graph,
			{
				...styledProjection,
				hiddenNodeIds: new Set(['B.md']),
			},
			['B.md'],
		);

		expect(graph.getNodeAttribute('B.md', 'hidden')).toBe(true);
		expect(graph.getEdgeAttribute('A->B', 'hidden')).toBe(true);
		expect(hiddenChanges).toEqual({
			nodeIds: ['B.md'],
			edgeIds: ['A->B'],
		});
		expect(nodeAttributesUpdated).not.toHaveBeenCalled();
		expect(edgeAttributesUpdated).not.toHaveBeenCalled();

		syncWorkspaceRuntimeGraphVisibility(graph, styledProjection, ['B.md']);

		expect(graph.getNodeAttribute('B.md', 'hidden')).toBe(false);
		expect(graph.getEdgeAttribute('A->B', 'hidden')).toBe(false);

		const styleHiddenGraph = createWorkspaceRuntimeGraph(
			styledProjection,
			new Map(),
			{
				...state,
				linkStyleOverrides: {
					...state.linkStyleOverrides,
					hidden: true,
				},
			},
			palette,
		);
		syncWorkspaceRuntimeGraphVisibility(styleHiddenGraph, styledProjection);

		expect(styleHiddenGraph.getEdgeAttribute('A->B', 'hidden')).toBe(true);
	});

	it('renders plain links as muted compatibility edges', () => {
		const plainProjection: GraphProjection = {
			...projection,
			nodes: [
				...projection.nodes,
				{
					id: 'B.md',
					path: 'B.md',
					title: 'B',
					folder: '',
					domains: [],
					tags: [],
				},
			],
			edges: [
				{
					id: 'A-plain-B',
					kind: 'plain-link',
					semantic: false,
					source: 'A.md',
					target: 'B.md',
					relation: 'link',
					directed: true,
					sourcePath: 'A.md',
					sourceField: 'body',
				},
			],
		};
		const graph = createWorkspaceRuntimeGraph(
			plainProjection,
			new Map(),
			{
				...createWorkspaceState(200),
				plainLinkStyleOverrides: {
					color: '#123456',
					size: 4,
					lineStyle: 'dotted',
				},
			},
			palette,
		);

		expect(graph.getEdgeAttributes('A-plain-B')).toMatchObject({
			color: '#123456',
			size: 4,
			lineStyle: 'dotted',
			type: 'dotted-arrow',
			label: '',
			forceLabel: false,
			kind: 'plain-link',
			semantic: false,
		});
	});

	it('renders unresolved links as styled compatibility edges', () => {
		const unresolvedProjection: GraphProjection = {
			...projection,
			nodes: [
				...projection.nodes,
				{
					id: '__unresolved__/Missing',
					kind: 'unresolved',
					path: 'Missing',
					title: 'Missing',
					folder: '',
					domains: [],
					tags: [],
				},
			],
			edges: [
				{
					id: 'A-unresolved-Missing',
					kind: 'unresolved-link',
					semantic: false,
					source: 'A.md',
					target: '__unresolved__/Missing',
					relation: 'link',
					directed: true,
					sourcePath: 'A.md',
					sourceField: 'body',
				},
			],
		};
		const graph = createWorkspaceRuntimeGraph(
			unresolvedProjection,
			new Map(),
			{
				...createWorkspaceState(200),
				unresolvedNodeStyleOverrides: {
					color: '#abcdef',
					size: 5,
				},
				unresolvedLinkStyleOverrides: {
					color: '#d97706',
					size: 2,
					lineStyle: 'dotted',
				},
			},
			palette,
		);

		expect(graph.getNodeAttributes('__unresolved__/Missing')).toMatchObject(
			{
				kind: 'unresolved',
				color: '#abcdef',
				size: 5,
			},
		);
		expect(graph.getEdgeAttributes('A-unresolved-Missing')).toMatchObject({
			color: '#d97706',
			size: 2,
			lineStyle: 'dotted',
			type: 'dotted-arrow',
			label: '',
			forceLabel: false,
			kind: 'unresolved-link',
			semantic: false,
		});
	});
});
