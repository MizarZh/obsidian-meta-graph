import Graph from 'graphology';
import { describe, expect, it } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../graph/graphology-adapter';
import { ForceAtlasLayout } from '../layouts/force-layout';

describe('ForceAtlasLayout', () => {
	it('unfixes cached nodes before applying graph spacing', async () => {
		const graph = new Graph<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes,
			Record<string, never>
		>({
			multi: true,
			type: 'mixed',
		});
		graph.addNode('A', node(0, 0));
		graph.addNode('B', node(1, 1));
		graph.addEdgeWithKey('A-B', 'A', 'B', {
			relation: 'related',
			type: 'line',
			size: 1,
			color: '#888888',
			hidden: false,
			label: '',
			forceLabel: false,
			lineStyle: 'solid',
		});

		await new ForceAtlasLayout(2).apply(graph);

		expect(graph.getNodeAttribute('A', 'fixed')).toBe(false);
		expect(graph.getNodeAttribute('B', 'fixed')).toBe(false);
	});
});

function node(x: number, y: number): RuntimeNodeAttributes {
	return {
		label: '',
		x,
		y,
		size: 7,
		color: '#777777',
		path: '',
		folder: '',
		domains: [],
		tags: [],
		fixed: true,
	};
}
