import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '../core/types';
import {
	GraphologyAdapter,
	getEdgeType,
	type GraphPosition,
} from '../graph/model/graphology-adapter';
import type { GraphPalette } from '../graph/styles/graph-styles';
import {
	applyBundledFlowEdges,
	applyCurvedFlowEdges,
	applyElkOrthogonalRoutes,
	applyOrthogonalFlowEdges,
	createBundledFlowRoutes,
	extractElkOrthogonalRoutes,
	toElkDirection,
} from '../layouts/elk-flow-layout';

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
		{
			id: 'B.md',
			path: 'B.md',
			title: 'B',
			folder: '',
			domains: [],
			tags: [],
		},
	],
	edges: [],
	rootIds: new Set(['A.md']),
};

function node(path: string, title: string): GraphProjection['nodes'][number] {
	return {
		id: path,
		path,
		title,
		folder: '',
		domains: [],
		tags: [],
	};
}

describe('GraphologyAdapter positions', () => {
	it('maps chevron arrows for each directed line style', () => {
		expect(getEdgeType('solid', true, 'chevron')).toBe('chevron-arrow');
		expect(getEdgeType('dashed', true, 'chevron')).toBe(
			'dashed-chevron-arrow',
		);
		expect(getEdgeType('dotted', true, 'chevron')).toBe(
			'dotted-chevron-arrow',
		);
		expect(getEdgeType('dash-dot', true, 'chevron')).toBe(
			'dash-dot-chevron-arrow',
		);
		expect(getEdgeType('solid', false, 'chevron')).toBe('line');
	});

	it.each([
		['LR', 'RIGHT'],
		['RL', 'LEFT'],
		['TD', 'DOWN'],
		['DT', 'UP'],
	] as const)('maps flow direction %s to ELK %s', (direction, expected) => {
		expect(toElkDirection(direction)).toBe(expected);
	});

	it('uses deterministic initial positions', () => {
		const adapter = new GraphologyAdapter(palette);
		const first = adapter.fromProjection(projection);
		const second = adapter.fromProjection(projection);

		expect(first.getNodeAttributes('A.md')).toMatchObject(
			second.getNodeAttributes('A.md'),
		);
		expect(first.getNodeAttributes('B.md')).toMatchObject(
			second.getNodeAttributes('B.md'),
		);
	});

	it('restores cached positions and fixes existing nodes for layout', () => {
		const positions = new Map<string, GraphPosition>([
			['A.md', { x: 12, y: 34 }],
		]);
		const graph = new GraphologyAdapter(palette).fromProjection(
			projection,
			positions,
		);

		expect(graph.getNodeAttributes('A.md')).toMatchObject({
			x: 12,
			y: 34,
			fixed: true,
		});
		expect(graph.getNodeAttribute('B.md', 'fixed')).toBe(false);
	});

	it('places new connected nodes away from cached neighbors', () => {
		const positions = new Map<string, GraphPosition>([
			['A.md', { x: 0, y: 0 }],
		]);
		const graph = new GraphologyAdapter(palette).fromProjection(
			{
				...projection,
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
			},
			positions,
		);
		const created = graph.getNodeAttributes('B.md');
		const distance = Math.hypot(created.x, created.y);

		expect(distance).toBeGreaterThan(1);
	});

	it('splits non-horizontal flow edges into orthogonal segments', () => {
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
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
		});
		graph.mergeNodeAttributes('A.md', { x: 0, y: 0 });
		graph.mergeNodeAttributes('B.md', { x: 100, y: 80 });

		applyOrthogonalFlowEdges(graph);

		expect(graph.hasEdge('A-to-B')).toBe(false);
		expect(graph.order).toBe(4);
		expect(graph.size).toBe(3);
		expect(graph.getEdgeAttribute('A-to-B__segment_1', 'type')).toBe(
			'line',
		);
		expect(graph.getEdgeAttribute('A-to-B__segment_2', 'type')).toBe(
			'line',
		);
		expect(graph.getEdgeAttribute('A-to-B__segment_3', 'type')).toBe(
			'arrow',
		);
		expect(
			graph.getEdgeAttribute('A-to-B__segment_1', 'flowRouteOrthogonal'),
		).toBe(true);
		expect(
			graph.getEdgeAttribute('A-to-B__segment_1', 'flowRoute'),
		).toEqual([
			{ x: 0, y: 0 },
			{ x: 50, y: 0 },
			{ x: 50, y: 80 },
			{ x: 100, y: 80 },
		]);
		expect(graph.getNodeAttribute('__flow-bend__A-to-B__1', 'isBend')).toBe(
			true,
		);
	});

	it('rounds orthogonal corners when radius is set', () => {
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
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
		});
		graph.mergeNodeAttributes('A.md', { x: 0, y: 0 });
		graph.mergeNodeAttributes('B.md', { x: 100, y: 80 });

		applyOrthogonalFlowEdges(graph, new Map(), 12);

		const segmentIds = graph
			.edges()
			.filter((edge) => edge.startsWith('A-to-B__segment_'))
			.sort(
				(left, right) =>
					Number(left.split('_').at(-1)) -
					Number(right.split('_').at(-1)),
			);
		expect(segmentIds.length).toBeGreaterThan(3);
		expect(graph.getEdgeAttribute(segmentIds.at(-1)!, 'type')).toBe(
			'arrow',
		);
	});

	it('creates deterministic curved segments for direct Flow edges', () => {
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
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
		});
		graph.mergeNodeAttributes('A.md', { x: 0, y: 0 });
		graph.mergeNodeAttributes('B.md', { x: 160, y: 0 });

		applyCurvedFlowEdges(
			graph,
			new Map([
				[
					'A-to-B',
					[
						{ x: 0, y: 0 },
						{ x: 160, y: 0 },
					],
				],
			]),
			'LR',
		);

		const bendNodes = graph
			.nodes()
			.filter((nodeId) => nodeId.startsWith('__flow-bend__'));
		expect(bendNodes.length).toBeGreaterThan(0);
		expect(
			bendNodes.some(
				(nodeId) => graph.getNodeAttribute(nodeId, 'y') !== 0,
			),
		).toBe(true);
		const terminalSegment = graph
			.edges()
			.find((edge) => edge.endsWith('__segment_8'));
		expect(terminalSegment).toBeDefined();
		expect(graph.getEdgeAttribute(terminalSegment!, 'type')).toBe('arrow');
	});

	it('shares bundled flow channels and keeps labels on target branches', () => {
		const bundledProjection: GraphProjection = {
			...projection,
			nodes: [node('A.md', 'A'), node('B.md', 'B'), node('C.md', 'C')],
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
		};
		const graph = new GraphologyAdapter(
			palette,
			[],
			[
				{
					id: 'flow-label',
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
		).fromProjection(bundledProjection);
		graph.mergeNodeAttributes('A.md', { x: 0, y: 0 });
		graph.mergeNodeAttributes('B.md', { x: 200, y: -60 });
		graph.mergeNodeAttributes('C.md', { x: 200, y: 60 });

		const routes = createBundledFlowRoutes(graph, new Map(), 'LR');
		const firstRoute = routes.get('A-to-B');
		const secondRoute = routes.get('A-to-C');
		expect(firstRoute?.[0]).toEqual(secondRoute?.[0]);
		expect(firstRoute?.[1]?.y).toBe(secondRoute?.[1]?.y);
		expect(firstRoute?.[2]?.y).toBe(secondRoute?.[2]?.y);
		expect(firstRoute?.[3]?.y).not.toBe(secondRoute?.[3]?.y);

		applyBundledFlowEdges(graph, routes);

		expect(graph.hasEdge('A-to-B')).toBe(false);
		expect(graph.hasEdge('A-to-C')).toBe(false);
		expect(graph.getEdgeAttribute('A-to-B__segment_4', 'label')).toBe(
			'Leads to',
		);
		expect(graph.getEdgeAttribute('A-to-B__segment_3', 'label')).toBe('');
		expect(
			graph
				.mapEdges((_edge, attributes) => attributes.type)
				.filter((type) => type === 'arrow'),
		).toHaveLength(2);
	});

	it('rounds bundled corners when radius is set', () => {
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
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
		});
		graph.mergeNodeAttributes('A.md', { x: 0, y: 0 });
		graph.mergeNodeAttributes('B.md', { x: 200, y: 0 });

		applyBundledFlowEdges(
			graph,
			new Map([
				[
					'A-to-B',
					[
						{ x: 60, y: 0 },
						{ x: 60, y: 100 },
						{ x: 140, y: 100 },
						{ x: 140, y: 0 },
					],
				],
			]),
			12,
		);

		const segmentIds = graph
			.edges()
			.filter((edge) => edge.startsWith('A-to-B__segment_'))
			.sort(
				(left, right) =>
					Number(left.split('_').at(-1)) -
					Number(right.split('_').at(-1)),
			);
		expect(segmentIds.length).toBeGreaterThan(5);
		expect(graph.getEdgeAttribute(segmentIds.at(-1)!, 'type')).toBe(
			'arrow',
		);
	});

	it('does not merge unrelated many-to-many crossings', () => {
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
			nodes: [
				node('A.md', 'A'),
				node('C.md', 'C'),
				node('B.md', 'B'),
				node('D.md', 'D'),
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
				{
					id: 'C-to-D',
					source: 'C.md',
					target: 'D.md',
					relation: 'leads-to',
					directed: true,
					sourcePath: 'C.md',
					sourceField: 'leads-to',
				},
			],
		});
		graph.mergeNodeAttributes('A.md', { x: 0, y: -60 });
		graph.mergeNodeAttributes('C.md', { x: 0, y: 60 });
		graph.mergeNodeAttributes('B.md', { x: 200, y: -60 });
		graph.mergeNodeAttributes('D.md', { x: 200, y: 60 });

		const routes = createBundledFlowRoutes(graph, new Map(), 'LR');
		const firstRoute = routes.get('A-to-B');
		const secondRoute = routes.get('C-to-D');

		expect(firstRoute?.[1]?.y).not.toBe(secondRoute?.[1]?.y);
	});

	it('keeps independent fan bundles in separate corridors', () => {
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
			nodes: [
				node('A.md', 'A'),
				node('D.md', 'D'),
				node('B.md', 'B'),
				node('C.md', 'C'),
				node('E.md', 'E'),
				node('F.md', 'F'),
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
				{
					id: 'A-to-C',
					source: 'A.md',
					target: 'C.md',
					relation: 'leads-to',
					directed: true,
					sourcePath: 'A.md',
					sourceField: 'leads-to',
				},
				{
					id: 'D-to-E',
					source: 'D.md',
					target: 'E.md',
					relation: 'leads-to',
					directed: true,
					sourcePath: 'D.md',
					sourceField: 'leads-to',
				},
				{
					id: 'D-to-F',
					source: 'D.md',
					target: 'F.md',
					relation: 'leads-to',
					directed: true,
					sourcePath: 'D.md',
					sourceField: 'leads-to',
				},
			],
		});
		graph.mergeNodeAttributes('A.md', { x: 0, y: -100 });
		graph.mergeNodeAttributes('D.md', { x: 0, y: 100 });
		graph.mergeNodeAttributes('B.md', { x: 240, y: -50 });
		graph.mergeNodeAttributes('C.md', { x: 240, y: 50 });
		graph.mergeNodeAttributes('E.md', { x: 240, y: -250 });
		graph.mergeNodeAttributes('F.md', { x: 240, y: -150 });

		const routes = createBundledFlowRoutes(graph, new Map(), 'LR');
		expect(routes.get('A-to-B')?.[1]?.y).toBe(routes.get('A-to-C')?.[1]?.y);
		expect(routes.get('D-to-E')?.[1]?.y).not.toBe(
			routes.get('A-to-B')?.[1]?.y,
		);
	});

	it('bundles fan-in edges by their shared target', () => {
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
			nodes: [node('A.md', 'A'), node('B.md', 'B'), node('C.md', 'C')],
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
					id: 'C-to-B',
					source: 'C.md',
					target: 'B.md',
					relation: 'leads-to',
					directed: true,
					sourcePath: 'C.md',
					sourceField: 'leads-to',
				},
			],
		});
		graph.mergeNodeAttributes('A.md', { x: 0, y: -60 });
		graph.mergeNodeAttributes('C.md', { x: 0, y: 60 });
		graph.mergeNodeAttributes('B.md', { x: 200, y: 0 });

		const routes = createBundledFlowRoutes(graph, new Map(), 'LR');
		expect(routes.get('A-to-B')?.[1]?.y).toBe(routes.get('C-to-B')?.[1]?.y);
		expect(routes.get('A-to-B')?.[0]?.y).not.toBe(
			routes.get('C-to-B')?.[0]?.y,
		);
	});

	it('uses ELK section points for orthogonal segments', () => {
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
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
		});
		graph.mergeNodeAttributes('A.md', { x: 0, y: 0 });
		graph.mergeNodeAttributes('B.md', { x: 200, y: 100 });

		applyElkOrthogonalRoutes(graph, [
			{
				id: 'A-to-B',
				sources: ['A.md'],
				targets: ['B.md'],
				sections: [
					{
						id: 'section',
						startPoint: { x: 60, y: 0 },
						bendPoints: [
							{ x: 120, y: 0 },
							{ x: 120, y: 100 },
						],
						endPoint: { x: 140, y: 100 },
					},
				],
			},
		]);

		expect(graph.getNodeAttributes('__flow-bend__A-to-B__2')).toMatchObject(
			{ x: 120, y: 0 },
		);
		expect(graph.getNodeAttributes('__flow-bend__A-to-B__3')).toMatchObject(
			{ x: 120, y: 100 },
		);
	});

	it('reuses cached ELK routes when link styles change', () => {
		const edgeProjection: GraphProjection = {
			...projection,
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
		};
		const routes = extractElkOrthogonalRoutes([
			{
				id: 'A-to-B',
				sources: ['A.md'],
				targets: ['B.md'],
				sections: [
					{
						id: 'section',
						startPoint: { x: 60, y: 0 },
						bendPoints: [{ x: 120, y: 60 }],
						endPoint: { x: 140, y: 100 },
					},
				],
			},
		]);
		const graph = new GraphologyAdapter(
			palette,
			[],
			[
				{
					id: 'styled',
					field: 'relation',
					value: 'leads-to',
					color: '#ff0000',
					size: 4,
					lineStyle: 'dashed',
					label: 'Styled',
					showLabel: true,
					hidden: false,
				},
			],
		).fromProjection(edgeProjection);
		graph.mergeNodeAttributes('A.md', { x: 0, y: 0 });
		graph.mergeNodeAttributes('B.md', { x: 200, y: 100 });

		applyOrthogonalFlowEdges(graph, routes);

		expect(graph.getNodeAttributes('__flow-bend__A-to-B__2')).toMatchObject(
			{ x: 120, y: 0 },
		);
		expect(graph.getNodeAttributes('__flow-bend__A-to-B__3')).toMatchObject(
			{ x: 120, y: 60 },
		);
		const styledSegment = graph
			.edges()
			.find((edge) => graph.getEdgeAttribute(edge, 'label') === 'Styled');
		expect(styledSegment).toBeDefined();
		expect(graph.getEdgeAttributes(styledSegment!)).toMatchObject({
			color: '#ff0000',
			size: 4,
			lineStyle: 'dashed',
			label: 'Styled',
			forceLabel: true,
		});
		expect(
			graph
				.mapEdges((_edge, attributes) => attributes.forceLabel)
				.filter(Boolean),
		).toHaveLength(1);
	});

	it('keeps related edges visible and undirected in orthogonal flow', () => {
		const relatedProjection: GraphProjection = {
			...projection,
			edges: [
				{
					id: 'A-related-B',
					source: 'A.md',
					target: 'B.md',
					relation: 'related',
					directed: false,
					sourcePath: 'A.md',
					sourceField: 'related',
				},
			],
		};
		const graph = new GraphologyAdapter(
			palette,
			[],
			[
				{
					id: 'related-style',
					field: 'relation',
					value: 'related',
					color: '#00ffff',
					size: 3,
					lineStyle: 'dotted',
					label: 'Related',
					showLabel: true,
					hidden: false,
				},
			],
		).fromProjection(relatedProjection);
		graph.mergeNodeAttributes('A.md', { x: 0, y: 0 });
		graph.mergeNodeAttributes('B.md', { x: 200, y: 100 });

		applyOrthogonalFlowEdges(
			graph,
			new Map([
				[
					'A-related-B',
					[
						{ x: 80, y: 0 },
						{ x: 80, y: 100 },
					],
				],
			]),
		);

		expect(graph.hasEdge('A-related-B')).toBe(false);
		expect(graph.size).toBeGreaterThan(0);
		graph.forEachEdge((edge, attributes) => {
			expect(graph.isUndirected(edge)).toBe(true);
			expect(attributes.type).toBe('dotted');
			expect(attributes.hidden).toBe(false);
			expect(attributes.color).toBe('#00ffff');
			expect(attributes.size).toBe(3);
		});
		expect(
			graph
				.mapEdges((_edge, attributes) => attributes.label)
				.filter(Boolean),
		).toEqual(['Related']);
	});
});
