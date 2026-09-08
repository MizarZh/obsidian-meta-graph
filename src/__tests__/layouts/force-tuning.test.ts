import Graph from 'graphology';
import type {
	Simulation,
	SimulationNodeDatum,
	SimulationLinkDatum,
} from 'd3-force';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import { D3ForceSimulation } from '@/layouts/d3-force-simulation';
import {
	DEFAULT_GRAPH_FORCE_SETTINGS,
	ForceAtlasLayout,
} from '@/layouts/force-layout';

type Node = SimulationNodeDatum & { id: string };
type Internals = {
	simulation?: Simulation<Node, SimulationLinkDatum<Node>>;
	applyTick(): void;
};
type Kind = 'chain' | 'star' | 'clusters';

function createGraph(kind: Kind, count = 16): RuntimeGraph {
	const graph: RuntimeGraph = new Graph({ multi: true, type: 'mixed' });
	for (let i = 0; i < count; i++)
		graph.addNode(String(i), {
			x: Math.cos(i * 2.4) * (1 + i / 4),
			y: Math.sin(i * 2.4) * (1 + i / 4),
			size: 7,
			label: '',
			color: '#888',
			path: '',
			folder: '',
			domains: [],
			tags: [],
		});
	const add = (a: number, b: number) =>
		graph.addEdge(String(a), String(b), {
			relation: 'related',
			type: 'line',
			size: 1,
			color: '#888',
			hidden: false,
			label: '',
			forceLabel: false,
			lineStyle: 'solid',
		});
	if (kind === 'chain') for (let i = 1; i < count; i++) add(i - 1, i);
	if (kind === 'star') for (let i = 1; i < count; i++) add(0, i);
	if (kind === 'clusters') {
		for (let i = 0; i < 16; i++)
			for (let j = i + 1; j < 16; j++)
				if (Math.floor(i / 8) === Math.floor(j / 8)) add(i, j);
		add(7, 8);
	}
	return graph;
}

beforeEach(() =>
	vi.stubGlobal('window', {
		setTimeout: vi.fn(),
		clearTimeout: vi.fn(),
	}),
);
afterEach(() => vi.unstubAllGlobals());

async function measure(kind: Kind, scale = 1) {
	const graph = createGraph(kind);
	await new ForceAtlasLayout().apply(graph);
	graph.updateEachNodeAttributes((_id, attributes) => ({
		...attributes,
		x: attributes.x * scale,
		y: attributes.y * scale,
	}));
	const renderer = {
		runtimeGraph: graph,
		beginForceMotion: vi.fn(),
		endForceMotion: vi.fn(),
		clearHeldBounds: vi.fn(),
		viewportToGraphPosition: (p: { x: number; y: number }) => p,
		syncForcePositions: vi.fn(),
	};
	const controller = new D3ForceSimulation(graph, renderer, scale);
	const internal = controller as unknown as Internals;
	const distance = (DEFAULT_GRAPH_FORCE_SETTINGS.linkDistance / 100) * scale;
	let tickCount = 0;
	let maxStep = 0;
	const tick = () => {
		const simulation = internal.simulation;
		if (!simulation) return;
		const before = graph
			.nodes()
			.map((id) => [
				graph.getNodeAttribute(id, 'x'),
				graph.getNodeAttribute(id, 'y'),
			]);
		simulation.stop().tick();
		internal.applyTick();
		graph.nodes().forEach((id, i) => {
			const { x, y } = graph.getNodeAttributes(id);
			if (!Number.isFinite(x) || !Number.isFinite(y))
				throw new Error('Non-finite position');
			maxStep = Math.max(
				maxStep,
				Math.hypot(x - before[i]![0]!, y - before[i]![1]!) / distance,
			);
		});
		tickCount++;
	};
	const start = graph.getNodeAttributes('0');
	const target = { x: start.x + distance * 2, y: start.y + distance };
	try {
		controller.drag('0', target);
		internal.simulation?.stop();
		for (let i = 0; i < 60; i++) tick();
		const pinError = Math.hypot(
			graph.getNodeAttribute('0', 'x') - target.x,
			graph.getNodeAttribute('0', 'y') - target.y,
		);
		controller.release('0');
		maxStep = 0;
		tickCount = 0;
		while (internal.simulation && tickCount < 600) tick();
		return {
			pinError,
			releaseStep: maxStep,
			settleTicks: tickCount,
			settled: !internal.simulation,
		};
	} finally {
		controller.stop();
	}
}

describe('force interaction tuning', () => {
	it.each(['chain', 'star'] as const)(
		'settles a static 150-node %s handoff within a bounded radius',
		async (kind) => {
			const graph = createGraph(kind, 150);
			await new ForceAtlasLayout().apply(graph);
			const radius = () => {
				const nodes = graph
					.nodes()
					.map((id) => graph.getNodeAttributes(id));
				const cx =
					nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
				const cy =
					nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
				return Math.sqrt(
					nodes.reduce(
						(sum, n) => sum + (n.x - cx) ** 2 + (n.y - cy) ** 2,
						0,
					) / nodes.length,
				);
			};
			const before = radius();
			const controller = new D3ForceSimulation(graph, {
				runtimeGraph: graph,
				beginForceMotion: vi.fn(),
				endForceMotion: vi.fn(),
				clearHeldBounds: vi.fn(),
				viewportToGraphPosition: (p) => p,
			});
			const internal = controller as unknown as Internals;
			controller.start();
			let ticks = 0;
			try {
				while (internal.simulation && ticks < 600) {
					internal.simulation.stop().tick();
					internal.applyTick();
					ticks++;
				}
				expect(radius() / before).toBeLessThan(5);
				expect(ticks).toBeLessThan(200);
				expect(internal.simulation).toBeUndefined();
			} finally {
				controller.stop();
			}
		},
	);
	it.each(['chain', 'star', 'clusters'] as const)(
		'%s keeps pinning exact and settles without large release jumps',
		async (kind) => {
			const tuned = await measure(kind);
			expect(tuned.pinError).toBeLessThan(1e-8);
			expect(tuned.settled).toBe(true);
			expect(tuned.releaseStep).toBeLessThan(0.067);
			expect(tuned.settleTicks).toBeLessThan(180);
		},
	);

	it('keeps relative motion consistent when graph spacing changes', async () => {
		const compact = await measure('chain', 0.5);
		const spread = await measure('chain', 2);
		// Barnes–Hut cell boundaries change with scale; allow small approximation drift.
		expect(
			Math.abs(compact.releaseStep / spread.releaseStep - 1),
		).toBeLessThan(0.05);
		expect(
			Math.abs(compact.settleTicks - spread.settleTicks),
		).toBeLessThanOrEqual(5);
	});
});
