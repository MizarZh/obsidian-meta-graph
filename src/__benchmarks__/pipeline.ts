// eslint-disable-next-line import/no-nodejs-modules -- Development-only Node benchmark; never imported by the plugin.
import { strict as assert } from 'node:assert';
import type { GraphProjection } from '@/core/types';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { setNodeStyleOverridesInState } from '@/workspace/state/style-state';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
import {
	createWorkspaceRuntimeGraph,
	syncWorkspaceRuntimeGraphStyles,
} from '@/ui/workspace/runtime-graph';

const palette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: '#ffffff',
};
const warmup = 10;
const samples = 40;

function fixture(count: number): GraphProjection {
	const nodes = Array.from({ length: count }, (_, i) => ({
		id: `node-${i}.md`,
		path: `node-${i}.md`,
		title: `Node ${i}`,
		folder: `folder-${i % 10}`,
		tags: [`tag-${i % 5}`],
		domains: [],
	}));
	return {
		nodes,
		edges: nodes.flatMap((node, i) =>
			[1, 7, 31].map((offset) => ({
				id: `edge-${i}-${offset}`,
				source: node.id,
				target: nodes[(i + offset) % count]!.id,
				relation: 'related',
				directed: true,
				sourcePath: node.path,
				sourceField: 'related',
			})),
		),
		rootIds: new Set([nodes[0]!.id]),
	};
}

function measure(
	operation: string,
	nodes: number,
	run: (index: number) => unknown,
) {
	for (let i = 0; i < warmup; i++) run(i);
	const timings = [];
	for (let i = 0; i < samples; i++) {
		const start = performance.now();
		run(i);
		timings.push(performance.now() - start);
	}
	timings.sort((a, b) => a - b);
	return {
		operation,
		nodes,
		edges: nodes * 3,
		samples,
		p50Ms: timings[Math.ceil(samples * 0.5) - 1]!,
		p95Ms: timings[Math.ceil(samples * 0.95) - 1]!,
		maxMs: timings[samples - 1]!,
	};
}

export function runBaseline() {
	const results = [];
	for (const count of [200, 1000, 5000]) {
		const projection = fixture(count);
		const state = { ...createWorkspaceState(count), projection };
		const baseline = createWorkspaceRenderBaseline(state);
		const styled = setNodeStyleOverridesInState(state, {
			color: '#ff0000',
		});
		const changes = analyzeWorkspaceStateChanges(styled, state, baseline);
		assert.equal(
			changes.shouldRebuild,
			false,
			'Style edits must not rebuild',
		);
		assert.equal(changes.styleRulesChanged, true);
		const copied = {
			...state,
			projection: {
				...projection,
				nodes: [...projection.nodes],
				edges: [...projection.edges],
			},
		};
		assert.equal(
			analyzeWorkspaceStateChanges(copied, state, baseline).shouldRebuild,
			false,
		);
		const positions = new Map(
			projection.nodes.map((node, i) => [
				node.id,
				{ x: i % 100, y: Math.floor(i / 100) },
			]),
		);
		const graph = createWorkspaceRuntimeGraph(
			projection,
			positions,
			state,
			palette,
		);
		assert.equal(graph.order, count);
		assert.equal(graph.size, count * 3);
		const position = {
			x: graph.getNodeAttribute('node-0.md', 'x'),
			y: graph.getNodeAttribute('node-0.md', 'y'),
		};
		results.push(
			measure('classify-style', count, () =>
				analyzeWorkspaceStateChanges(styled, state, baseline),
			),
		);
		results.push(
			measure('classify-copied-topology', count, () =>
				analyzeWorkspaceStateChanges(copied, state, baseline),
			),
		);
		results.push(
			measure('capture-render-baseline', count, () =>
				createWorkspaceRenderBaseline(state),
			),
		);
		results.push(
			measure('create-runtime-graph', count, () =>
				createWorkspaceRuntimeGraph(
					projection,
					positions,
					state,
					palette,
				),
			),
		);
		results.push(
			measure('sync-runtime-styles', count, (i) =>
				syncWorkspaceRuntimeGraphStyles(
					graph,
					projection,
					i % 2 ? state : styled,
					palette,
				),
			),
		);
		syncWorkspaceRuntimeGraphStyles(graph, projection, styled, palette);
		assert.equal(graph.getNodeAttribute('node-0.md', 'color'), '#ff0000');
		assert.equal(graph.getNodeAttribute('node-0.md', 'x'), position.x);
		assert.equal(graph.getNodeAttribute('node-0.md', 'y'), position.y);
		assert.equal(graph.size, count * 3);
	}
	return {
		fixture:
			'deterministic-ring-v1: directed offsets 1,7,31; fixed positions; no conditional style rules',
		warmup,
		samples,
		units: 'milliseconds',
		scope: 'Node CPU microbenchmarks; excludes Obsidian, DOM, GPU, indexing and layout execution',
		results,
	};
}
