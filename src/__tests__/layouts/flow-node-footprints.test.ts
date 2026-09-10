import Graph from 'graphology';
import { describe, it, expect } from 'vitest';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import { createFlowNodeFootprints } from '@/layouts/flow-node-footprints';
import { getFlowGroupMinimumWidth } from '@/layouts/flow-group-frame';

function graph() {
	const result = new Graph() as RuntimeGraph;
	result.addNode('node', {
		x: 0,
		y: 0,
		size: 9,
		label: 'A long node label',
		color: '#000',
		path: '',
		folder: '',
		domains: [],
		tags: [],
	});
	return result;
}

describe('compact Flow reservations', () => {
	it('does not reserve disabled labels', () => {
		expect(
			createFlowNodeFootprints(
				graph(),
				12,
				4,
				() => 1000,
				'right',
				true,
				false,
			).get('node'),
		).toEqual({ width: 120, height: 44 });
	});
	it('does not inflate node height when a horizontal label gets longer', () => {
		const runtime = graph();
		const short = createFlowNodeFootprints(
			runtime,
			12,
			4,
			() => 40,
			'right',
			true,
		).get('node')!;
		const long = createFlowNodeFootprints(
			runtime,
			12,
			4,
			() => 240,
			'right',
			true,
		).get('node')!;
		expect(long.height).toBe(short.height);
		expect(long.height).toBeLessThanOrEqual(60);
		expect(long.width).toBeGreaterThan(short.width);
	});
	it('uses label height, not its width, for top/bottom clearance', () => {
		for (const position of ['top', 'bottom'] as const) {
			const short = createFlowNodeFootprints(
				graph(),
				12,
				4,
				() => 40,
				position,
				true,
			).get('node')!;
			const long = createFlowNodeFootprints(
				graph(),
				12,
				4,
				() => 240,
				position,
				true,
			).get('node')!;
			expect(long.height).toBe(short.height);
			expect(long.height).toBeLessThan(250);
		}
	});
	it('keeps node-only envelopes small', () => {
		const runtime = graph();
		runtime.setNodeAttribute('node', 'label', '');
		expect(
			createFlowNodeFootprints(runtime, 12, 4, () => 1000).get('node'),
		).toEqual({ width: 120, height: 44 });
	});
	it('reserves short capsules by measured text width, not the 160px maximum', () => {
		expect(getFlowGroupMinimumWidth('Group 2', 48)).toBe(84);
		expect(getFlowGroupMinimumWidth('Long title', 500)).toBe(176);
	});
});
