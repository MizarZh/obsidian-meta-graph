import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '@/core/types';
import { GraphologyAdapter } from '@/graph/model/graphology-adapter';
import {
	toG6Data,
	resolveG6LabelVisibility,
} from '@/graph/renderers/g6/g6-data';
import { createG6LabelStyles } from '@/graph/renderers/g6/g6-styles';
import { G6_LOGICAL_EDGE_TYPE } from '@/graph/renderers/g6/g6-logical-edge';
import { createG6CoordinateSpace } from '@/graph/renderers/g6/g6-coordinate-space';
import type { GraphPalette } from '@/graph/styles/graph-styles';
import { ArcLayout } from '@/layouts/arc-layout';
import { createArcBandGraphShape } from '@/graph/renderers/g6/g6-groups';

describe('G6 Arc adapter', () => {
	it('creates the complete Arc Group band and outward title anchor', () => {
		const shape = createArcBandGraphShape(
			{
				kind: 'arc-band',
				groupId: 'group-1',
				name: 'Group 1',
				color: '#7654ff',
				nodeIds: ['A.md', 'B.md'],
				direction: 'right',
				start: 10,
				end: 30,
				halfWidth: 5,
			},
			2,
		);

		expect(shape.points).toEqual([
			{ x: -5, y: 10 },
			{ x: -5, y: 30 },
			{ x: 5, y: 30 },
			{ x: 5, y: 10 },
		]);
		expect(shape.label).toEqual({ x: -7, y: 20 });
	});

	it('collapses Arc bend segments into one layout-owned logical edge', async () => {
		const graph = createGraph();
		const layout = new ArcLayout(1, 'right');
		await layout.apply(graph);

		const routes = layout.getEdgeRoutes();
		const data = toG6Data(
			graph,
			undefined,
			resolveG6LabelVisibility(graph, {
				labelDensity: 1,
				forceLabels: false,
			}),
			createLabelStyles(),
			undefined,
			routes,
		);

		expect(data.nodes.map((node) => node.id)).toEqual(['A.md', 'B.md']);
		expect(data.edges).toHaveLength(1);
		expect(data.edges[0]).toMatchObject({
			id: 'A-to-B',
			source: 'A.md',
			target: 'B.md',
			type: G6_LOGICAL_EDGE_TYPE,
			style: { endArrow: true, label: true, labelText: 'Next' },
		});
		const controlPoints = data.edges[0]?.style?.controlPoints;
		expect(Array.isArray(controlPoints)).toBe(true);
		expect((controlPoints as unknown[]).length).toBeGreaterThan(5);
	});

	it('maps Arc label radians and outward direction into G6 transforms', async () => {
		const graph = createGraph();
		const layout = new ArcLayout(1, 'up', 'name', 'asc', 'auto');
		await layout.apply(graph);

		const data = toG6Data(
			graph,
			undefined,
			undefined,
			createLabelStyles(),
			createG6CoordinateSpace(graph),
			layout.getEdgeRoutes(),
		);
		const node = data.nodes.find(({ id }) => id === 'A.md');

		expect(node?.style).toMatchObject({
			labelPlacement: 'center',
			labelOffsetX: 0,
			labelOffsetY: 0,
			labelTextAlign: 'left',
			labelTextBaseline: 'middle',
		});
		const transform = node?.style?.labelTransform as
			[['translate', number, number], ['rotate', number]] | undefined;
		expect(transform?.[0]?.[1]).toBeCloseTo(0);
		expect(transform?.[0]?.[2]).toBeGreaterThan(0);
		expect(transform?.[1]).toEqual(['rotate', 90]);
		const edge = data.edges[0];
		const controls = edge?.style?.controlPoints as [number, number][];
		const endpointY = data.nodes[0]?.style?.y as number;
		expect(Math.min(...controls.map((point) => point[1]))).toBeLessThan(
			endpointY,
		);
	});
});

function createGraph() {
	return new GraphologyAdapter(
		PALETTE,
		[],
		[
			{
				id: 'next',
				field: 'relation',
				value: 'leads-to',
				color: '#f00',
				size: 2,
				lineStyle: 'solid',
				label: 'Next',
				showLabel: true,
				hidden: false,
			},
		],
	).fromProjection(PROJECTION);
}

function createLabelStyles() {
	return createG6LabelStyles(PALETTE, {
		labelSize: 12,
		labelBold: false,
		labelItalic: false,
		labelPosition: 'right',
		labelOffset: 1,
		labelTheme: {
			labelLightTextColor: '#111',
			labelLightBackgroundColor: '#fff',
			labelLightBackgroundOpacity: 1,
			labelDarkTextColor: '#fff',
			labelDarkBackgroundColor: '#111',
			labelDarkBackgroundOpacity: 1,
		},
	});
}

const PALETTE: GraphPalette = {
	node: '#111',
	selected: '#22f',
	edge: '#777',
	mutedNode: '#aaa',
	mutedEdge: '#bbb',
	label: '#111',
	labelBackground: '#fff',
	background: '#fff',
};

const PROJECTION: GraphProjection = {
	nodes: [
		{
			id: 'A.md',
			path: 'A.md',
			title: 'A',
			folder: '',
			domains: [],
			tags: [],
		},
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
			id: 'A-to-B',
			source: 'A.md',
			target: 'B.md',
			relation: 'leads-to',
			directed: true,
			sourcePath: 'A.md',
			sourceField: 'leads-to',
		},
	],
	rootIds: new Set(['A.md']),
};
