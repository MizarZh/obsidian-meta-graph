import { describe, expect, it } from 'vitest';
import type {
	ChartGroupDefinition,
	GraphProjection,
} from '../../../core/types';
import { GraphologyAdapter } from '../../../graph/model/graphology-adapter';
import { createG6CoordinateSpace } from '../../../graph/renderers/g6/g6-coordinate-space';
import {
	resolveG6LabelVisibility,
	toG6Data,
} from '../../../graph/renderers/g6/g6-data';
import { createRadialSectorViewportShape } from '../../../graph/renderers/g6/g6-groups';
import { G6_LOGICAL_EDGE_TYPE } from '../../../graph/renderers/g6/g6-logical-edge';
import { createG6LabelStyles } from '../../../graph/renderers/g6/g6-styles';
import type { GraphPalette } from '../../../graph/styles/graph-styles';
import { DEFAULT_GRAPH_FORCE_SETTINGS } from '../../../layouts/force-layout';
import {
	applyStableLayout,
	createLayoutSnapshot,
} from '../../../layouts/stable-layout';

describe('G6 HEB adapter', () => {
	it('collapses a bundled route into one logical G6 edge', async () => {
		const graph = createGraph();
		const snapshot = createLayoutSnapshot();
		await applyStableLayout(graph, snapshot, [], createLayoutOptions());

		const route = snapshot.edgeRoutes?.get('A-to-C');
		expect(route?.commands.length).toBeGreaterThan(5);
		expect(route).toMatchObject({
			id: 'A-to-C',
			source: 'Topics/A.md',
			target: 'Other/C.md',
			parallelRouteOwner: 'layout',
		});
		expect(Number.isFinite(route?.arrow?.angle ?? Number.NaN)).toBe(true);
		expect(Number.isFinite(route?.label?.angle ?? Number.NaN)).toBe(true);

		const data = toG6Data(
			graph,
			undefined,
			resolveG6LabelVisibility(graph, {
				labelDensity: 1,
				forceLabels: false,
			}),
			createLabelStyles(),
			createG6CoordinateSpace(graph),
			snapshot.edgeRoutes,
		);

		expect(data.nodes.map(({ id }) => id).sort()).toEqual([
			'Other/C.md',
			'Topics/A.md',
			'Topics/B.md',
		]);
		expect(
			data.nodes.some(({ id }) =>
				id.startsWith('__hierarchical-edge-bundling-bend__'),
			),
		).toBe(false);
		expect(data.edges).toHaveLength(1);
		expect(data.edges[0]).toMatchObject({
			id: 'A-to-C',
			source: 'Topics/A.md',
			target: 'Other/C.md',
			type: G6_LOGICAL_EDGE_TYPE,
			data: { logicalEdgeId: 'A-to-C', directed: true },
			style: { endArrow: true, label: true, labelText: 'Next' },
		});
		expect(data.edges[0]?.style?.controlPoints).toHaveLength(
			(route?.commands.length ?? 1) - 1,
		);
		expect(
			data.nodes.some(({ style }) => Array.isArray(style.labelTransform)),
		).toBe(true);
	});

	it('maps radial-sector geometry through the G6 viewport', async () => {
		const graph = createGraph();
		const snapshot = createLayoutSnapshot();
		await applyStableLayout(graph, snapshot, [], createLayoutOptions());
		const geometry = snapshot.groupGeometries.find(
			(candidate) => candidate.kind === 'radial-sector',
		);
		expect(geometry).toBeDefined();
		if (!geometry || geometry.kind !== 'radial-sector') return;

		const shape = createRadialSectorViewportShape(geometry, (point) => ({
			x: 500 + point.x * 2,
			y: 400 - point.y * 2,
		}));

		expect(shape.points.length).toBeGreaterThan(16);
		expect(shape.rect.width).toBeGreaterThan(0);
		expect(shape.rect.height).toBeGreaterThan(0);
		expect(shape.label.x).toBeGreaterThanOrEqual(shape.rect.left);
		expect(shape.label.x).toBeLessThanOrEqual(
			shape.rect.left + shape.rect.width,
		);
		expect(shape.label.y).toBeGreaterThanOrEqual(shape.rect.top);
		expect(shape.label.y).toBeLessThanOrEqual(
			shape.rect.top + shape.rect.height,
		);
	});
});

function createGraph() {
	return new GraphologyAdapter(
		PALETTE,
		[],
		[
			{
				id: 'next',
				field: 'relation',
				value: 'leads-to',
				color: '#f00',
				size: 2,
				lineStyle: 'solid',
				label: 'Next',
				showLabel: true,
				hidden: false,
			},
		],
	).fromProjection(PROJECTION);
}

function createLayoutOptions() {
	return {
		mode: 'hierarchical-edge-bundling' as const,
		forceLayout: true,
		graphSpacing: 1,
		graphForceSettings: DEFAULT_GRAPH_FORCE_SETTINGS,
		flowEdgeStyle: 'straight' as const,
		flowDirection: 'LR' as const,
		flowLayerSpacing: 1,
		flowLaneSpacing: 1,
		flowCornerRadius: 0,
		arcSpacing: 1,
		arcDirection: 'right' as const,
		arcLabelAngle: 'auto' as const,
		nodeSort: 'path' as const,
		nodeSortDirection: 'asc' as const,
		groups: [GROUP],
		groupByNode: new Map([
			['Topics/A.md', GROUP.id],
			['Topics/B.md', GROUP.id],
		]),
	};
}

function createLabelStyles() {
	return createG6LabelStyles(PALETTE, {
		labelSize: 12,
		labelBold: false,
		labelItalic: false,
		labelPosition: 'right',
		labelOffset: 1,
		labelTheme: {
			labelLightTextColor: '#111',
			labelLightBackgroundColor: '#fff',
			labelLightBackgroundOpacity: 1,
			labelDarkTextColor: '#fff',
			labelDarkBackgroundColor: '#111',
			labelDarkBackgroundOpacity: 1,
		},
	});
}

const GROUP: ChartGroupDefinition = {
	id: 'topics',
	name: 'Topics',
	color: '#7c6ff0',
	mode: 'manual',
	padding: 1,
};

const PALETTE: GraphPalette = {
	node: '#111',
	selected: '#22f',
	edge: '#777',
	mutedNode: '#aaa',
	mutedEdge: '#bbb',
	label: '#111',
	labelBackground: '#fff',
	background: '#fff',
};

const PROJECTION: GraphProjection = {
	nodes: [
		{
			id: 'Topics/A.md',
			path: 'Topics/A.md',
			title: 'A',
			folder: 'Topics',
			domains: [],
			tags: [],
		},
		{
			id: 'Topics/B.md',
			path: 'Topics/B.md',
			title: 'B',
			folder: 'Topics',
			domains: [],
			tags: [],
		},
		{
			id: 'Other/C.md',
			path: 'Other/C.md',
			title: 'C',
			folder: 'Other',
			domains: [],
			tags: [],
		},
	],
	edges: [
		{
			id: 'A-to-C',
			source: 'Topics/A.md',
			target: 'Other/C.md',
			relation: 'leads-to',
			directed: true,
			sourcePath: 'Topics/A.md',
			sourceField: 'leads-to',
		},
	],
	rootIds: new Set(['Topics/A.md']),
};
