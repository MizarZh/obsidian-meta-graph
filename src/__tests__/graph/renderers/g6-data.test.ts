import Graph from 'graphology';
import { describe, expect, it } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../../graph/model/graphology-adapter';
import type { GraphPalette } from '../../../graph/styles/graph-styles';
import {
	createG6StylePatch,
	createG6LabelStylePatch,
	resolveG6LabelVisibility,
	toG6Data,
} from '../../../graph/renderers/g6/g6-data';
import {
	createG6InteractionStyles,
	G6_INTERACTION_STATE,
	resolveG6LineDash,
	resolveG6NodeType,
} from '../../../graph/renderers/g6/g6-styles';

describe('G6 data adapter', () => {
	it('maps runtime nodes, styles, and metadata to G6 data', () => {
		const data = toG6Data(createRuntimeGraph());

		expect(data.nodes[0]).toMatchObject({
			id: 'A.md',
			type: 'rect',
			data: {
				path: 'A.md',
				isPrimary: true,
				fixed: true,
			},
			style: {
				x: 10,
				y: 20,
				size: 16,
				fill: '#112233',
				opacity: 0.5,
				visibility: 'visible',
				labelText: 'A',
			},
		});
		expect(data.nodes[1]).toMatchObject({
			id: 'B.md',
			type: 'circle',
			style: { visibility: 'hidden' },
		});
	});

	it('maps edge direction, patterns, arrows, and logical identity', () => {
		const data = toG6Data(createRuntimeGraph());

		expect(data.edges[0]).toMatchObject({
			id: 'A-to-B',
			source: 'A.md',
			target: 'B.md',
			type: 'quadratic',
			data: {
				relation: 'leads-to',
				directed: true,
				logicalEdgeId: 'logical-A-B',
				logicalSource: 'A.md',
				logicalTarget: 'B.md',
				arrowStyle: 'chevron',
				parallelGroupKey: 'A\0B',
				parallelLane: -0.5,
				parallelCount: 2,
				parallelDirection: 1,
			},
			style: {
				stroke: '#445566',
				lineWidth: 3,
				lineDash: [8, 6],
				opacity: 0.75,
				endArrow: true,
				endArrowType: 'vee',
				endArrowSize: [10.125, 12.375],
				label: true,
				labelText: 'Leads to',
				curveOffset: -15,
			},
		});
		expect(data.edges[1]).toMatchObject({
			id: 'B-related-A',
			style: {
				lineDash: [2, 4],
				endArrow: false,
				label: false,
			},
		});
	});

	it('creates updateData-compatible style patches for changed ids', () => {
		const graph = createRuntimeGraph();
		graph.mergeNodeAttributes('A.md', {
			type: 'star',
			color: '#abcdef',
			hidden: true,
		});
		graph.mergeEdgeAttributes('A-to-B', {
			color: '#fedcba',
			lineStyle: 'dash-dot',
			hidden: true,
		});

		const patch = createG6StylePatch(graph, {
			nodeIds: ['A.md', 'missing'],
			edgeIds: ['A-to-B', 'missing'],
		});

		expect(patch.nodes).toHaveLength(1);
		expect(patch.nodes[0]).toMatchObject({
			id: 'A.md',
			type: 'star',
			style: {
				fill: '#abcdef',
				visibility: 'hidden',
			},
		});
		expect(patch.edges).toHaveLength(1);
		expect(patch.edges[0]).toMatchObject({
			id: 'A-to-B',
			type: 'quadratic',
			style: {
				stroke: '#fedcba',
				lineDash: [8, 4, 2, 4],
				visibility: 'hidden',
			},
		});
	});

	it('creates label-only patches without touching unlabeled edges', () => {
		const graph = createRuntimeGraph();
		const patch = createG6LabelStylePatch(
			graph,
			{ geometry: 1, label: 1, screen: 1 },
			resolveG6LabelVisibility(graph, {
				labelDensity: 1,
				forceLabels: false,
			}),
			{
				node: { labelFontSize: 9 },
				edge: { labelFontSize: 9 },
			},
		);

		expect(patch.nodes).toHaveLength(2);
		expect(patch.edges).toHaveLength(1);
		expect(patch.edges[0]).toMatchObject({
			id: 'A-to-B',
			style: { labelFontSize: 9, labelText: 'Leads to' },
		});
		expect(patch.edges[0]).not.toHaveProperty('type');
		expect(patch.edges[0]?.style).not.toHaveProperty('curveOffset');
	});

	it('uses a stable monotonic node-label budget and explicit force policy', () => {
		const graph = createRuntimeGraph();
		graph.setNodeAttribute('B.md', 'hidden', false);
		graph.setEdgeAttribute('B-related-A', 'label', 'Related');

		const none = resolveG6LabelVisibility(graph, {
			labelDensity: 0,
			forceLabels: false,
		});
		const half = resolveG6LabelVisibility(graph, {
			labelDensity: 0.5,
			forceLabels: false,
		});
		const all = resolveG6LabelVisibility(graph, {
			labelDensity: 1,
			forceLabels: false,
		});
		const forced = resolveG6LabelVisibility(graph, {
			labelDensity: 0,
			forceLabels: true,
		});

		expect(none.nodeIds.size).toBe(0);
		expect(half.nodeIds.size).toBe(1);
		expect(all.nodeIds.size).toBe(2);
		expect(forced.nodeIds.size).toBe(2);
		expect(all.edgeIds).toEqual(new Set(['A-to-B']));
		expect(forced.edgeIds).toEqual(new Set(['A-to-B', 'B-related-A']));
	});

	it('maps every supported shape and line pattern', () => {
		expect(
			(
				[
					'circle',
					'square',
					'diamond',
					'triangle',
					'hexagon',
					'star',
				] as const
			).map(resolveG6NodeType),
		).toEqual(['circle', 'rect', 'diamond', 'triangle', 'hexagon', 'star']);
		expect(resolveG6LineDash('solid')).toBeUndefined();
		expect(resolveG6LineDash('dotted')).toEqual([2, 4]);
	});

	it('keeps interaction emphasis in screen pixels without G6 theme states', () => {
		const styles = createG6InteractionStyles(TEST_PALETTE, {
			geometry: 1,
			label: 0.5,
			screen: 0.25,
		});
		const selectedNode = evaluateStateStyle(
			styles.node.state?.[G6_INTERACTION_STATE.selected],
			{ style: { size: 20, fill: '#112233' } },
		);
		const hoveredEdge = evaluateStateStyle(
			styles.edge.state?.[G6_INTERACTION_STATE.hovered],
			{ style: { lineWidth: 3, stroke: '#445566' } },
		);

		expect(selectedNode).toMatchObject({
			size: 21.5,
			halo: true,
			haloLineWidth: 1,
		});
		expect(selectedNode).not.toHaveProperty('labelFontSize');
		expect(hoveredEdge).toMatchObject({
			lineWidth: 3.5,
			halo: false,
		});
		expect(styles.node.state).not.toHaveProperty('selected');
		expect(styles.edge.state).not.toHaveProperty('selected');
	});
});

const TEST_PALETTE: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: '#ffffff',
	background: '#ffffff',
};

function evaluateStateStyle(
	style: unknown,
	datum: { style: Record<string, string | number> },
): Record<string, unknown> {
	if (typeof style !== 'function') throw new Error('Expected state callback');
	return (style as (value: typeof datum) => Record<string, unknown>)(datum);
}

function createRuntimeGraph(): RuntimeGraph {
	const graph = new Graph<
		RuntimeNodeAttributes,
		RuntimeEdgeAttributes,
		Record<string, never>
	>({ multi: true, type: 'mixed' });
	graph.addNode('A.md', {
		label: 'A',
		x: 10,
		y: 20,
		size: 8,
		opacity: 0.5,
		color: '#112233',
		path: 'A.md',
		folder: '',
		domains: ['engineering'],
		tags: ['graph'],
		isPrimary: true,
		fixed: true,
		type: 'square',
	});
	graph.addNode('B.md', {
		label: 'B',
		x: 30,
		y: 40,
		size: 6,
		color: '#223344',
		path: 'B.md',
		folder: '',
		domains: [],
		tags: [],
		hidden: true,
	});
	graph.addDirectedEdgeWithKey('A-to-B', 'A.md', 'B.md', {
		relation: 'leads-to',
		type: 'dashed-chevron-arrow',
		size: 3,
		opacity: 0.75,
		color: '#445566',
		hidden: false,
		label: 'Leads to',
		forceLabel: true,
		lineStyle: 'dashed',
		arrowStyle: 'chevron',
		arrowSize: 1.5,
		logicalEdgeId: 'logical-A-B',
		logicalSource: 'A.md',
		logicalTarget: 'B.md',
		parallelGroupKey: 'A\0B',
		parallelLane: -0.5,
		parallelCount: 2,
		parallelDirection: 1,
	});
	graph.addUndirectedEdgeWithKey('B-related-A', 'B.md', 'A.md', {
		relation: 'related',
		type: 'dotted',
		size: 1,
		color: '#667788',
		hidden: false,
		label: '',
		forceLabel: false,
		lineStyle: 'dotted',
	});
	return graph;
}
