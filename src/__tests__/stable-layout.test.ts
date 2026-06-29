import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '../core/types';
import {
	GraphologyAdapter,
	type GraphPosition,
} from '../graph/model/graphology-adapter';
import type { GraphPalette } from '../graph/styles/graph-styles';
import { DEFAULT_GRAPH_FORCE_SETTINGS } from '../layouts/force-layout';
import {
	applyStableLayout,
	createLayoutSnapshot,
	getLayoutSnapshotKey,
	hydrateManualLayoutPositions,
	LayoutSnapshotStore,
} from '../layouts/stable-layout';

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
	nodes: [node('A.md', 'A'), node('B.md', 'B')],
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

describe('stable layout orchestration', () => {
	it('keys layout snapshots by mode-specific layout inputs', () => {
		expect(
			getLayoutSnapshotKey({
				activeChartId: 'map',
				mode: 'graph',
				arcDirection: 'right',
				flowEdgeStyle: 'straight',
				flowDirection: 'LR',
			}),
		).toBe('map-graph');
		expect(
			getLayoutSnapshotKey({
				activeChartId: 'map',
				mode: 'arc',
				arcDirection: 'left',
				flowEdgeStyle: 'straight',
				flowDirection: 'LR',
			}),
		).toBe('map-arc-left');
		expect(
			getLayoutSnapshotKey({
				activeChartId: 'map',
				mode: 'flow',
				arcDirection: 'right',
				flowEdgeStyle: 'orthogonal',
				flowDirection: 'TD',
			}),
		).toBe('map-flow-orthogonal-TD');
	});

	it('hydrates only manual layout modes from persisted positions', () => {
		const snapshot = createLayoutSnapshot();
		const manualLayout = {
			nodes: { 'A.md': { x: 12, y: 34 } },
			groups: [],
		};

		hydrateManualLayoutPositions(snapshot, 'graph', manualLayout);
		expect(snapshot.positions.has('A.md')).toBe(false);

		hydrateManualLayoutPositions(snapshot, 'free', manualLayout);
		expect(snapshot.positions.get('A.md')).toEqual({ x: 12, y: 34 });
	});

	it('reuses snapshots for the same layout key', () => {
		const store = new LayoutSnapshotStore();
		const first = store.get({
			activeChartId: 'map',
			mode: 'graph',
			arcDirection: 'right',
			flowEdgeStyle: 'straight',
			flowDirection: 'LR',
		});
		const second = store.get({
			activeChartId: 'map',
			mode: 'graph',
			arcDirection: 'right',
			flowEdgeStyle: 'orthogonal',
			flowDirection: 'TD',
		});

		expect(second).toBe(first);
	});

	it('preserves flow layout and places only new connected nodes on edge-only changes', async () => {
		const positions = new Map<string, GraphPosition>([
			['A.md', { x: 0, y: 0 }],
		]);
		const graph = new GraphologyAdapter(palette).fromProjection(
			projection,
			positions,
		);
		const snapshot = createLayoutSnapshot();
		snapshot.positions.set('A.md', { x: 0, y: 0 });

		await applyStableLayout(graph, snapshot, ['B.md'], {
			mode: 'flow',
			forceLayout: false,
			graphSpacing: 1,
			graphForceSettings: DEFAULT_GRAPH_FORCE_SETTINGS,
			flowEdgeStyle: 'straight',
			flowDirection: 'LR',
			flowSpacing: 1,
			arcSpacing: 1,
			arcDirection: 'right',
		});

		expect(graph.getNodeAttributes('B.md')).toMatchObject({
			x: 220,
			y: 0,
			fixed: false,
		});
		expect(snapshot.positions.get('B.md')).toEqual({ x: 220, y: 0 });
		expect(snapshot.edgeIds).toEqual(new Set(['A-to-B']));
	});
});

function node(id: string, title: string): GraphProjection['nodes'][number] {
	return {
		id,
		path: id,
		title,
		folder: '',
		domains: [],
		tags: [],
	};
}
