import Graph from 'graphology';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../graph/model/graphology-adapter';
import type { SigmaRenderer } from '../graph/renderers/sigma/sigma-renderer';
import { D3ForceSimulation } from '../layouts/d3-force-simulation';

describe('D3ForceSimulation', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('does not hold renderer bounds while the force layout settles', () => {
		vi.useFakeTimers();
		vi.stubGlobal('window', {
			clearTimeout: globalThis.clearTimeout,
			setTimeout: globalThis.setTimeout,
		});
		const graph = new Graph<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes,
			Record<string, never>
		>({ multi: true, type: 'mixed' });
		graph.addNode('A', node(0, 0));
		graph.addNode('B', node(1, 0));
		graph.addEdgeWithKey('A-B', 'A', 'B', edge());
		const renderer = {
			instance: { refresh: vi.fn() },
			holdCurrentBounds: vi.fn(),
			clearHeldBounds: vi.fn(),
		} as unknown as SigmaRenderer;

		const simulation = new D3ForceSimulation(graph, renderer);
		simulation.start();

		expect(renderer.holdCurrentBounds).not.toHaveBeenCalled();
		expect(renderer.clearHeldBounds).not.toHaveBeenCalled();

		vi.advanceTimersByTime(4000);

		expect(renderer.clearHeldBounds).toHaveBeenCalledTimes(1);
	});

	it('starts rebuilt simulations at interaction heat instead of full heat', () => {
		vi.useFakeTimers();
		vi.stubGlobal('window', {
			clearTimeout: globalThis.clearTimeout,
			setTimeout: globalThis.setTimeout,
		});
		const graph = new Graph<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes,
			Record<string, never>
		>({ multi: true, type: 'mixed' });
		graph.addNode('A', node(0, 0));
		graph.addNode('B', node(1, 0));
		graph.addEdgeWithKey('A-B', 'A', 'B', edge());
		const renderer = {
			instance: { refresh: vi.fn() },
			holdCurrentBounds: vi.fn(),
			clearHeldBounds: vi.fn(),
		} as unknown as SigmaRenderer;

		const simulation = new D3ForceSimulation(graph, renderer);
		simulation.start();

		expect(readSimulationAlpha(simulation)).toBeCloseTo(0.12);
	});

	it('scales dynamic repulsion to graph coordinates', () => {
		const graph = new Graph<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes,
			Record<string, never>
		>({ multi: true, type: 'mixed' });
		graph.addNode('A', node(0, 0));
		graph.addNode('B', node(2.5, 0));
		graph.addEdgeWithKey('A-B', 'A', 'B', edge());
		const renderer = {
			instance: { refresh: vi.fn() },
			holdCurrentBounds: vi.fn(),
			clearHeldBounds: vi.fn(),
		} as unknown as SigmaRenderer;

		const simulation = new D3ForceSimulation(graph, renderer);
		const charge = readChargeForce(simulation);

		expect(charge.strength()({ id: 'A' })).toBeCloseTo(-10);
		expect(charge.distanceMin()).toBeCloseTo(0.625);
		expect(charge.distanceMax()).toBeCloseTo(20);
	});

	it('reprojects dragged nodes from viewport targets on ticks', () => {
		vi.useFakeTimers();
		vi.stubGlobal('window', {
			clearTimeout: globalThis.clearTimeout,
			setTimeout: globalThis.setTimeout,
		});
		const graph = new Graph<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes,
			Record<string, never>
		>({ multi: true, type: 'mixed' });
		graph.addNode('A', node(0, 0));
		graph.addNode('B', node(10, 0));
		graph.addEdgeWithKey('A-B', 'A', 'B', edge());
		const renderer = {
			instance: {
				refresh: vi.fn(),
				viewportToGraph: vi.fn(() => ({ x: 3, y: 4 })),
			},
			holdCurrentBounds: vi.fn(),
			clearHeldBounds: vi.fn(),
		} as unknown as SigmaRenderer;

		const simulation = new D3ForceSimulation(graph, renderer);
		simulation.drag('A', { x: 0, y: 0 }, { x: 400, y: 300 });
		applyTick(simulation);

		expect(renderer.instance.viewportToGraph).toHaveBeenCalledWith(
			expect.objectContaining({ x: 400, y: 300 }),
		);
		expect(graph.getNodeAttribute('A', 'x')).toBeCloseTo(3);
		expect(graph.getNodeAttribute('A', 'y')).toBeCloseTo(4);
	});
});

function readSimulationAlpha(simulation: D3ForceSimulation): number {
	return (
		simulation as unknown as {
			simulation: { alpha(): number };
		}
	).simulation.alpha();
}

function applyTick(simulation: D3ForceSimulation): void {
	(
		simulation as unknown as {
			applyTick(): void;
		}
	).applyTick();
}

function readChargeForce(simulation: D3ForceSimulation): {
	strength(): (node: { id: string }) => number;
	distanceMin(): number;
	distanceMax(): number;
} {
	return (
		simulation as unknown as {
			simulation: {
				force(name: 'charge'): {
					strength(): (node: { id: string }) => number;
					distanceMin(): number;
					distanceMax(): number;
				};
			};
		}
	).simulation.force('charge');
}

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
	};
}

function edge(): RuntimeEdgeAttributes {
	return {
		relation: 'related',
		type: 'line',
		size: 1,
		color: '#888888',
		hidden: false,
		label: '',
		forceLabel: false,
		lineStyle: 'solid',
	};
}
