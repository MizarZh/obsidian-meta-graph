import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import {
	toForce3DData,
	syncForce3DDataStyles,
} from '@/graph/renderers/force-3d/force-3d-data';
import { syncWorkspaceRuntimeGraphVisibility } from '@/ui/workspace/runtime-graph';
import type { GraphProjection, KnowledgeNode } from '@/core/types';
import {
	advanceTimeline,
	applyTimeline,
	indexTimeline,
	normalizeTimeline,
	parseTimelineDate,
	timelineRange,
} from '@/graph/timeline';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { setTimelineInState } from '@/workspace/state/chart-settings';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
import { createWorkspaceRenderPlan } from '@/ui/workspace/render-plan';
import { createDefaultMetaGraphDocument } from '@/workspace/meta-graph-model';
import {
	createPersistenceContextFromV1,
	parsePersistedMetaGraphDocumentV2,
	serializeWorkspaceStateV2,
} from '@/workspace/meta-graph-v2/codec';

const node = (id: string, createdTime?: number): KnowledgeNode => ({
	id,
	path: id,
	title: id,
	folder: '',
	tags: [],
	domains: [],
	createdTime,
});
const nodes = [node('a', 100), node('b', 200), node('c', 300), node('undated')];
function initial() {
	const state = createWorkspaceState(200);
	state.projection = {
		nodes,
		edges: [],
		rootIds: new Set(),
		hiddenNodeIds: new Set(['a']),
	} as GraphProjection;
	return state;
}

describe('timeline', () => {
	it('reveals 3D nodes and links incrementally and reuses cached spatial positions', () => {
		const state = { ...initial(), mode: 'graph-3d' as const };
		const graph = new Graph() as RuntimeGraph;
		for (const node of nodes) {
			graph.addNode(node.id, {
				label: node.title,
				path: node.path,
				x: 0,
				y: 0,
				size: 5,
				color: '#000',
				folder: '',
				tags: [],
				domains: [],
			});
		}
		graph.addEdgeWithKey('bc', 'b', 'c', {
			relation: 'related',
			forceLabel: false,
			lineStyle: 'solid',
			size: 1,
			color: '#000',
			label: '',
			type: 'line',
			hidden: false,
		});
		const seek = (nodeCount: number) => {
			const next = applyTimeline(
				state,
				normalizeTimeline({
					enabled: true,
					step: 'node',
					nodeCount,
				}),
			);
			syncWorkspaceRuntimeGraphVisibility(graph, next.projection!);
		};
		seek(0);
		const empty = toForce3DData(graph);
		expect(empty).toEqual({ nodes: [], links: [] });
		seek(1);
		expect(syncForce3DDataStyles(graph, empty).nodeVisibilityChanged).toBe(
			true,
		);
		const first = toForce3DData(graph);
		expect(first.nodes.map((node) => node.id)).toEqual(['b']);
		expect(first.links).toHaveLength(0);
		Object.assign(first.nodes[0]!, { x: 10, y: 20, z: 30 });
		const cache = new Map(first.nodes.map((node) => [node.id, node]));
		seek(2);
		const second = toForce3DData(graph, cache);
		expect(second.nodes.map((node) => node.id)).toEqual(['b', 'c']);
		expect(second.links.map((link) => link.id)).toEqual(['bc']);
		expect(second.nodes[0]).toBe(first.nodes[0]);
		expect(second.nodes[0]).toMatchObject({ x: 10, y: 20, z: 30 });
		seek(0);
		expect(toForce3DData(graph, cache)).toEqual({ nodes: [], links: [] });
	});
	it('normalizes old/malformed settings and reversed bounds', () => {
		expect(normalizeTimeline()).toEqual({
			enabled: false,
			field: 'created',
			start: null,
			end: null,
			current: null,
			nodeCount: null,
			step: 'day',
			speed: 1,
		});
		expect(
			normalizeTimeline({
				enabled: 'true',
				field: 'bad',
				start: Infinity,
				end: NaN,
				step: 'year',
			}),
		).toEqual(normalizeTimeline());
		expect(normalizeTimeline({ start: 200, end: 100 })).toMatchObject({
			start: 100,
			end: 200,
		});
	});
	it('parses single ISO dates and rejects arrays, ambiguous dates and impossible days', () => {
		expect(parseTimelineDate('2024-02-29')).toBe(
			new Date(2024, 1, 29).getTime(),
		);
		expect(parseTimelineDate('2024-02-29T12:30:00Z')).toBe(
			Date.parse('2024-02-29T12:30:00Z'),
		);
		for (const value of [
			'2025-02-29',
			'2024-13-01',
			'01/02/2025',
			['2024-01-01'],
			2024,
			null,
		])
			expect(parseTimelineDate(value)).toBeUndefined();
	});
	it('caches date indexes by immutable nodes and field', () => {
		expect(indexTimeline(nodes, 'created')).toBe(
			indexTimeline(nodes, 'created'),
		);
		expect(indexTimeline(nodes, 'created')).toMatchObject({
			min: 100,
			max: 300,
			undated: 1,
		});
		expect(indexTimeline(nodes, 'modified').times.size).toBe(0);
		const changed = [{ ...nodes[0]!, metadata: { date: '2025-01-02' } }];
		expect(indexTimeline(changed, 'metadata.date').times.size).toBe(0);
		expect(
			normalizeTimeline({ field: 'metadata.date', start: 100, end: 200 }),
		).toMatchObject({ field: 'created', start: null, end: null });
		expect(indexTimeline([...nodes], 'created')).not.toBe(
			indexTimeline(nodes, 'created'),
		);
	});
	it('combines visibility with existing hidden nodes without touching canonical projection', () => {
		const state = initial();
		const config = normalizeTimeline({
			enabled: true,
			start: 100,
			end: 200,
		});
		const preview = applyTimeline(state, config);
		const cursorPreview = applyTimeline(state, {
			...config,
			end: 300,
			current: 200,
		});
		expect([...cursorPreview.projection!.hiddenNodeIds!].sort()).toEqual([
			'a',
			'c',
			'undated',
		]);
		expect([...preview.projection!.hiddenNodeIds!].sort()).toEqual([
			'a',
			'c',
		]);
		expect([...state.projection!.hiddenNodeIds!]).toEqual(['a']);
		expect(preview.projection!.nodes).toBe(state.projection!.nodes);
		expect(preview.projection!.edges).toBe(state.projection!.edges);
		expect(applyTimeline(state)).toBe(state);
	});
	it.each([
		'graph',
		'graph-3d',
		'cube',
		'free',
		'flow',
		'arc',
		'hierarchical-edge-bundling',
	] as const)('uses visibility-only rendering in %s', (mode) => {
		const state = { ...initial(), mode };
		const next = applyTimeline(
			setTimelineInState(state, { enabled: true, end: 200 }),
		);
		const changes = analyzeWorkspaceStateChanges(
			next,
			state,
			createWorkspaceRenderBaseline(state),
		);
		expect(changes).toMatchObject({
			shouldRebuild: false,
			forceLayout: false,
			fitAfterRender: false,
			graphVisibilityChanged: true,
		});
		expect(createWorkspaceRenderPlan(changes)).toMatchObject({
			rebuild: undefined,
			runtimeGraphSync: 'visibility',
			restartForceLayout: false,
		});
	});
	it('clamps empty/single-date ranges and advances calendar months without skipping February', () => {
		expect(
			timelineRange(normalizeTimeline(), indexTimeline([], 'created')),
		).toEqual([0, 0]);
		expect(
			timelineRange(
				normalizeTimeline({ start: -1, end: 999 }),
				indexTimeline([node('a', 100)], 'created'),
			),
		).toEqual([100, 100]);
		expect(
			new Date(
				advanceTimeline(new Date(2025, 0, 31).getTime(), 'month'),
			).getDate(),
		).toBe(28);
		expect(
			new Date(
				advanceTimeline(new Date(2025, 0, 1).getTime(), 'week'),
			).getDate(),
		).toBe(8);
	});
	it('persists settings per chart, including while disabled', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const original = createWorkspaceState(200, 1.5, document);
		const state = setTimelineInState(original, {
			field: 'modified',
			start: 100,
			end: 200,
			current: 150,
			step: 'month',
		});
		expect(setTimelineInState(state, {})).toBe(state);
		expect(
			state.charts.filter((chart) => chart.id !== state.activeChartId),
		).toEqual(
			original.charts.filter(
				(chart) => chart.id !== original.activeChartId,
			),
		);
		const text = serializeWorkspaceStateV2(
			state,
			createPersistenceContextFromV1(document),
		);
		const parsed = parsePersistedMetaGraphDocumentV2(text, 200, 1.5);
		expect(
			createWorkspaceState(200, 1.5, parsed.document).timeline,
		).toEqual(state.timeline);
	});
});
