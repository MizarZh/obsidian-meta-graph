import { describe, expect, it } from 'vitest';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import { resolveCubeDisplayPositions } from '@/graph/renderers/cube-3d/cube-display';

function createGraph(nodeIds: string[]): RuntimeGraph {
	return {
		nodes: () => nodeIds,
		getNodeAttributes: (nodeId: string) => ({
			x: 0,
			y: 0,
			size: 10,
			color: '#44a37f',
			label: nodeId,
			path: nodeId,
			isBend: false,
		}),
	} as unknown as RuntimeGraph;
}

describe('resolveCubeDisplayPositions', () => {
	it('keeps face placement stable as timeline members hide and reappear', () => {
		const graph = createGraph(['A', 'B', 'C']);
		const readAttributes = graph.getNodeAttributes.bind(graph);
		const hidden = new Set<string>();
		graph.getNodeAttributes = (id) => ({
			...readAttributes(id), hidden: hidden.has(String(id)),
		});
		const manual = {
			nodes: { A: { x: 0.2, y: 0.3, groupId: 'cube-front' } },
			groups: [],
		};
		const original = resolveCubeDisplayPositions(graph, manual);
		for (const id of graph.nodes()) hidden.add(id);
		expect(resolveCubeDisplayPositions(graph, manual)).toEqual(original);
		hidden.delete('B');
		expect(resolveCubeDisplayPositions(graph, manual)).toEqual(original);
		hidden.clear();
		expect(resolveCubeDisplayPositions(graph, manual)).toEqual(original);
	});
	it('keeps manual cube positions even when they overlap', () => {
		const positions = resolveCubeDisplayPositions(createGraph(['A', 'B']), {
			nodes: {
				A: { x: 0, y: 0, groupId: 'cube-front' },
				B: { x: 0, y: 0, groupId: 'cube-front' },
			},
			groups: [],
		});

		expect(positions.get('A')).toMatchObject({
			faceId: 'cube-front',
			x: 0,
			y: 0,
		});
		expect(positions.get('B')).toMatchObject({
			faceId: 'cube-front',
			x: 0,
			y: 0,
		});
	});
});
