import { describe, expect, it } from 'vitest';
import type { RuntimeGraph } from '../graph/model/graphology-adapter';
import { resolveCubeDisplayPositions } from '../graph/renderers/cube-3d/cube-display';

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
