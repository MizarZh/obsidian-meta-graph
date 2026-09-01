import { describe, expect, it, vi } from 'vitest';
import type { GraphProjection } from '../core/types';
import type { GraphPalette } from '../graph/styles/graph-styles';
import {
	applyBundledFlowEdges,
	createBundledFlowRoutes,
} from '../layouts/elk-flow-layout';
import {
	createWorkspaceRuntimeGraph,
	prepareWorkspaceRuntimeGraphVisibilityIndex,
	syncWorkspaceRuntimeGraphStyles,
	syncWorkspaceRuntimeGraphVisibility,
} from '../ui/workspace/runtime-graph';
import { createWorkspaceState } from '../workspace/state/workspace-state';

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
