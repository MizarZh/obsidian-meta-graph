import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '../core/types';
import type { GraphPalette } from '../graph/styles/graph-styles';
import {
	createWorkspaceRuntimeGraph,
	syncWorkspaceRuntimeGraphStyles,
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
			x: 10,
			y: 20,
			fixed: true,
		});
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
});
