import { describe, expect, it } from 'vitest';
import type { FlowEdgeStyle, GraphProjection } from '../../../core/types';
import { GraphologyAdapter } from '../../../graph/model/graphology-adapter';
import {
	resolveRouteLabelPlacement,
	toG6Data,
} from '../../../graph/renderers/g6/g6-data';
import { createFlowContainerViewportRect } from '../../../graph/renderers/g6/g6-groups';
import { G6_LOGICAL_EDGE_TYPE } from '../../../graph/renderers/g6/g6-logical-edge';
import type { GraphPalette } from '../../../graph/styles/graph-styles';
import { DEFAULT_GRAPH_FORCE_SETTINGS } from '../../../layouts/force-layout';
import type { PlanarEdgeRoute } from '../../../layouts/planar-geometry';
import {
	applyStableLayout,
	createLayoutSnapshot,
} from '../../../layouts/stable-layout';

describe('G6 Flow adapter', () => {
	it.each([
		['straight', 'line'],
		['orthogonal', G6_LOGICAL_EDGE_TYPE],
		['curve', G6_LOGICAL_EDGE_TYPE],
		['bundled', G6_LOGICAL_EDGE_TYPE],
	] as const)(
		'renders %s Flow edges as logical G6 edges',
		async (style, type) => {
			const graph = new GraphologyAdapter(PALETTE).fromProjection(
				PROJECTION,
			);
			const snapshot = createLayoutSnapshot();

			await applyStableLayout(
				graph,
				snapshot,
				[],
				createFlowOptions(style),
			);
			const data = toG6Data(
				graph,
				undefined,
				undefined,
				undefined,
				undefined,
				snapshot.edgeRoutes,
			);

			expect(data.nodes.map(({ id }) => id).sort()).toEqual([
				'A.md',
				'B.md',
				'C.md',
			]);
			expect(data.edges).toHaveLength(2);
			expect(data.edges.every((edge) => edge.type === type)).toBe(true);
			expect(data.edges.map(({ id }) => id).sort()).toEqual([
				'A-to-B',
				'A-to-C',
			]);
			if (style === 'straight') {
				expect(snapshot.edgeRoutes).toBeUndefined();
			} else {
				expect(snapshot.edgeRoutes?.size).toBe(2);
				expect(
					data.edges.every((edge) =>
						Array.isArray(edge.style?.controlPoints),
					),
				).toBe(true);
			}
		},
	);

	it('publishes Flow container geometry and maps inverted view coordinates', async () => {
		const graph = new GraphologyAdapter(PALETTE).fromProjection(PROJECTION);
		const snapshot = createLayoutSnapshot();
		await applyStableLayout(graph, snapshot, [], {
			...createFlowOptions('orthogonal'),
			groups: [
				{
					id: 'group-1',
					name: 'Group 1',
					color: '#7654ff',
					mode: 'manual',
					padding: 1,
				},
			],
			groupByNode: new Map([
				['A.md', 'group-1'],
				['B.md', 'group-1'],
			]),
		});

		const geometry = snapshot.groupGeometries.find(
			(candidate) => candidate.kind === 'flow-container',
		);
		expect(geometry).toBeDefined();
		if (!geometry || geometry.kind !== 'flow-container') return;
		const rect = createFlowContainerViewportRect(geometry, (point) => ({
			x: point.x * 2 + 10,
			y: 500 - point.y * 2,
		}));
		expect(rect.width).toBeCloseTo(geometry.width * 2);
		expect(rect.height).toBeCloseTo(geometry.height * 2);
		expect(rect.top).toBeLessThan(500 - geometry.y * 2);
	});

	it('places a routed label on its requested Flow branch', () => {
		const route: PlanarEdgeRoute = {
			id: 'edge',
			source: 'A',
			target: 'B',
			start: { x: 0, y: 0 },
			commands: [
				{ kind: 'line', to: { x: 80, y: 0 } },
				{ kind: 'line', to: { x: 80, y: 20 } },
				{ kind: 'line', to: { x: 100, y: 20 } },
			],
			parallelRouteOwner: 'layout',
			label: { position: { x: 90, y: 20 }, angle: 0 },
		};

		expect(resolveRouteLabelPlacement(route)).toBeCloseTo(110 / 120);
	});
});

function createFlowOptions(flowEdgeStyle: FlowEdgeStyle) {
	return {
		mode: 'flow' as const,
		forceLayout: true,
		graphSpacing: 1,
		graphForceSettings: DEFAULT_GRAPH_FORCE_SETTINGS,
		flowEdgeStyle,
		flowDirection: 'LR' as const,
		flowLayerSpacing: 1,
		flowLaneSpacing: 1,
		flowCornerRadius: 12,
		arcSpacing: 1,
		arcDirection: 'right' as const,
		arcLabelAngle: 'auto' as const,
		nodeSort: 'name' as const,
		nodeSortDirection: 'asc' as const,
	};
}

function node(id: string): GraphProjection['nodes'][number] {
	return {
		id,
		path: id,
		title: id.replace('.md', ''),
		folder: '',
		domains: [],
		tags: [],
	};
}

const PROJECTION: GraphProjection = {
	nodes: [node('A.md'), node('B.md'), node('C.md')],
	edges: [
		{
			id: 'A-to-B',
			source: 'A.md',
			target: 'B.md',
			relation: 'leads-to',
			directed: true,
			sourcePath: 'A.md',
			sourceField: 'leads-to',
		},
		{
			id: 'A-to-C',
			source: 'A.md',
			target: 'C.md',
			relation: 'leads-to',
			directed: true,
			sourcePath: 'A.md',
			sourceField: 'leads-to',
		},
	],
	rootIds: new Set(['A.md']),
};

const PALETTE: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: '#ffffff',
	background: '#ffffff',
};
