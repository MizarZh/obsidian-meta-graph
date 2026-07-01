import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../graph/model/graphology-adapter';
import type { GraphPalette } from '../graph/styles/graph-styles';
import {
	findOpenDisplayPosition,
	getCubeFaceIdForNode,
	hasCubeDisplayOverlap,
	isCubeFaceId,
} from '../graph/renderers/cube-3d/cube-faces';
import {
	getLinkEndpointId,
	hasFiniteCoordinates,
	syncForce3DDataStyles,
	toForce3DData,
} from '../graph/renderers/force-3d/force-3d-data';
import {
	createConnectionDragState,
	getFinishedConnection,
	isConnectionDragStart,
	updateConnectionDragState,
	type ConnectionDragRenderer,
} from '../graph/renderers/renderer-interaction';
import {
	getNodeLabelBox,
	getRotatedNodeLabelBox,
	getScaledLabelSize,
} from '../graph/renderers/sigma/sigma-label-geometry';
import {
	reduceSigmaEdge,
	reduceSigmaNode,
} from '../graph/renderers/sigma/sigma-hover-policy';

const palette: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: 'rgba(0, 0, 0, 0.8)',
};

describe('graph renderer helpers', () => {
	it('converts runtime graph nodes and links for Force 3D', () => {
		const graph = createRuntimeGraph();

		const data = toForce3DData(graph);

		expect(data.nodes).toEqual([
			expect.objectContaining({
				id: 'A.md',
				label: 'A',
				color: '#111111',
				size: 8,
				path: 'A.md',
				isPrimary: true,
				x: 1,
				y: 2,
			}),
			expect.objectContaining({
				id: 'B.md',
				label: 'B',
				color: '#222222',
				size: 6,
				path: 'B.md',
				x: 3,
				y: 4,
			}),
		]);
		expect(data.links).toEqual([
			{
				id: 'A-to-B',
				source: 'A.md',
				target: 'B.md',
				color: '#333333',
				size: 2,
				label: 'custom',
				forceLabel: true,
				directed: true,
				hidden: false,
			},
		]);
	});

	it('syncs Force 3D style fields without replacing graph data', () => {
		const graph = createRuntimeGraph();
		const data = toForce3DData(graph);
		const source = data.nodes[0]!;
		const target = data.nodes[1]!;
		data.links[0]!.source = source;
		data.links[0]!.target = target;

		graph.mergeNodeAttributes('A.md', {
			color: '#abcdef',
			size: 12,
			isContext: true,
		});
		graph.mergeEdgeAttributes('A-to-B', {
			color: '#fedcba',
			size: 4,
			label: 'updated',
			forceLabel: true,
			type: 'line',
			hidden: true,
		});

		syncForce3DDataStyles(graph, data);

		expect(data.nodes[0]).toBe(source);
		expect(data.links[0]!.source).toBe(source);
		expect(data.links[0]!.target).toBe(target);
		expect(data.nodes[0]).toMatchObject({
			color: '#abcdef',
			size: 12,
			isContext: true,
		});
		expect(data.links[0]).toMatchObject({
			color: '#fedcba',
			size: 4,
			label: 'updated',
			directed: false,
			hidden: true,
		});
	});

	it('reads Force 3D endpoint ids and finite coordinates', () => {
		expect(getLinkEndpointId({ id: 'A.md' } as never)).toBe('A.md');
		expect(getLinkEndpointId(undefined)).toBe('');
		expect(
			hasFiniteCoordinates({
				id: 'A.md',
				label: 'A',
				color: '#111111',
				size: 8,
				path: 'A.md',
				x: 1,
				y: 2,
				z: 3,
			}),
		).toBe(true);
	});

	it('maps cube groups and display positions', () => {
		expect(isCubeFaceId('cube-left')).toBe(true);
		expect(isCubeFaceId('unknown')).toBe(false);
		expect(getCubeFaceIdForNode('A.md', 'cube-right')).toBe('cube-right');
		expect(getCubeFaceIdForNode('A.md', undefined)).toMatch(/^cube-/u);
		expect(
			hasCubeDisplayOverlap({ x: 0, y: 0 }, { x: 0.05, y: 0.05 }),
		).toBe(true);

		const position = findOpenDisplayPosition(3, [
			{ x: 0, y: 0 },
			{ x: 0.1, y: 0.1 },
		]);

		expect(position.x).toBeGreaterThanOrEqual(-0.72);
		expect(position.x).toBeLessThanOrEqual(0.72);
		expect(position.y).toBeGreaterThanOrEqual(-0.72);
		expect(position.y).toBeLessThanOrEqual(0.72);
	});

	it('creates and updates shared connection drag state', () => {
		const renderer = createDragRenderer();
		const event = createPointerEvent({
			ctrlKey: true,
			button: 0,
			x: 70,
			y: 80,
		});

		expect(isConnectionDragStart(event)).toBe(true);

		const start = createConnectionDragState(renderer, 'A.md', {
			x: 12,
			y: 24,
		});
		const updated = updateConnectionDragState(renderer, start, event);

		expect(start).toEqual({
			sourceNodeId: 'A.md',
			x1: 10,
			y1: 20,
			x2: 12,
			y2: 24,
		});
		expect(updated).toEqual({
			sourceNodeId: 'A.md',
			targetNodeId: 'B.md',
			x1: 10,
			y1: 20,
			x2: 70,
			y2: 80,
		});
		expect(getFinishedConnection(updated)).toEqual({
			sourceNodeId: 'A.md',
			targetNodeId: 'B.md',
		});
	});

	it('reduces Sigma node and edge hover display state', () => {
		const node = createNodeAttributes();
		const edge = createEdgeAttributes();

		expect(
			reduceSigmaNode(
				'A.md',
				node,
				{
					selectedNodeId: 'A.md',
					hoveredNeighborhood: new Set(['A.md']),
					forceLabels: false,
				},
				palette,
			),
		).toMatchObject({
			color: palette.selected,
			size: node.size + 3,
			highlighted: true,
			forceLabel: true,
			zIndex: 3,
		});
		expect(
			reduceSigmaNode(
				'C.md',
				node,
				{
					activeHoverNodeId: 'A.md',
					hoveredNeighborhood: new Set(['A.md', 'B.md']),
					forceLabels: true,
				},
				palette,
			),
		).toMatchObject({
			color: palette.mutedNode,
			label: null,
			forceLabel: false,
			zIndex: 0,
		});
		expect(
			reduceSigmaEdge(edge, { activeHoverNodeId: 'A.md' }, palette, [
				'A.md',
				'B.md',
			]),
		).toMatchObject({ size: edge.size + 1, zIndex: 2 });
		expect(
			reduceSigmaEdge(edge, { activeHoverNodeId: 'C.md' }, palette, [
				'A.md',
				'B.md',
			]),
		).toMatchObject({ color: palette.mutedEdge, size: 0.4, zIndex: 0 });
	});

	it('computes Sigma label geometry independent of renderer lifecycle', () => {
		expect(getScaledLabelSize(14, 7)).toBe(14);
		expect(getNodeLabelBox(10, 20, 5, 30, 12, 5, 'right')).toEqual({
			x: 15,
			y: 14,
			textX: 20,
			textY: 20,
			textAlign: 'left',
		});
		expect(getNodeLabelBox(10, 20, 5, 30, 12, 5, 'right', 14)).toEqual({
			x: 24,
			y: 14,
			textX: 29,
			textY: 20,
			textAlign: 'left',
		});
		expect(getRotatedNodeLabelBox(5, 30, 12, 5, 7, -1, 'left')).toEqual({
			x: 12,
			y: -6,
			textX: 17,
			textY: 0,
			textAlign: 'left',
		});
		expect(getRotatedNodeLabelBox(5, 30, 12, 5, 14, -1, 'left')).toEqual({
			x: 19,
			y: -6,
			textX: 24,
			textY: 0,
			textAlign: 'left',
		});
	});
});

function createRuntimeGraph(): RuntimeGraph {
	const graph = new Graph<
		RuntimeNodeAttributes,
		RuntimeEdgeAttributes,
		Record<string, never>
	>({ multi: true, type: 'mixed' });
	graph.addNode('A.md', {
		label: 'A',
		x: 1,
		y: 2,
		size: 8,
		color: '#111111',
		path: 'A.md',
		folder: '',
		domains: [],
		tags: [],
		isPrimary: true,
	});
	graph.addNode('B.md', {
		label: 'B',
		x: 3,
		y: 4,
		size: 6,
		color: '#222222',
		path: 'B.md',
		folder: '',
		domains: [],
		tags: [],
	});
	graph.addNode('__bend', {
		label: '',
		x: 0,
		y: 0,
		size: 0,
		color: '#000000',
		path: '__bend',
		folder: '',
		domains: [],
		tags: [],
		isBend: true,
	});
	graph.addDirectedEdgeWithKey('A-to-B', 'A.md', 'B.md', {
		relation: 'leads-to',
		type: 'arrow',
		size: 2,
		color: '#333333',
		hidden: false,
		label: 'custom',
		forceLabel: true,
		lineStyle: 'solid',
	});
	return graph;
}

function createNodeAttributes(): RuntimeNodeAttributes {
	return {
		label: 'A',
		x: 1,
		y: 2,
		size: 8,
		color: '#111111',
		path: 'A.md',
		folder: '',
		domains: [],
		tags: [],
	};
}

function createEdgeAttributes(): RuntimeEdgeAttributes {
	return {
		relation: 'leads-to',
		type: 'arrow',
		size: 2,
		color: '#333333',
		hidden: false,
		label: 'custom',
		forceLabel: true,
		lineStyle: 'solid',
	};
}

function createDragRenderer(): ConnectionDragRenderer {
	return {
		getViewportPosition: (event) => ({
			x: event.clientX,
			y: event.clientY,
		}),
		getNodeAtViewportPosition: (position) =>
			position.x >= 50 ? 'B.md' : 'A.md',
		getNodeViewportPosition: (nodeId) =>
			nodeId === 'A.md' ? { x: 10, y: 20 } : undefined,
	};
}

function createPointerEvent({
	ctrlKey,
	button,
	x,
	y,
}: {
	ctrlKey: boolean;
	button: number;
	x: number;
	y: number;
}): PointerEvent {
	return {
		ctrlKey,
		button,
		clientX: x,
		clientY: y,
	} as PointerEvent;
}
