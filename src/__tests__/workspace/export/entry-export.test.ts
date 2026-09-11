import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import type { GraphProjection } from '@/core/types';
import type {
	RuntimeGraph,
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes,
} from '@/graph/model/graphology-adapter';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import {
	createEntryDocument,
	csvCell,
	selectExportEntries,
	serializeEntries,
} from '@/workspace/export/entry-export';
import { logicalExportEdges } from '@/workspace/export/logical-export-graph';
import { exportFilename } from '@/workspace/export/export-file';
import type { ChartExportOptions } from '@/workspace/export/export-options';

const options: ChartExportOptions = {
	format: 'json',
	filename: 'Chart',
	range: 'graph',
	scale: 2,
	background: 'theme',
	legend: false,
	entries: 'both',
	entryScope: 'chart',
	includeMetadata: false,
};
const projection: GraphProjection = {
	nodes: ['A', 'B', 'C'].map((id) => ({
		id,
		path: `${id}.md`,
		title: id,
		folder: '',
		tags: ['标签'],
		domains: [],
		metadata: { secret: 'optional' },
	})),
	edges: [
		{
			id: 'ab',
			source: 'A',
			target: 'B',
			directed: true,
			relation: 'related',
			sourcePath: 'A.md',
			sourceField: 'related',
		},
		{
			id: 'ba',
			source: 'B',
			target: 'A',
			directed: true,
			relation: 'leads-to',
			sourcePath: 'B.md',
			sourceField: 'leads-to',
		},
		{
			id: 'bc',
			source: 'B',
			target: 'C',
			directed: false,
			relation: 'related',
			sourcePath: 'B.md',
			sourceField: 'related',
		},
	],
	rootIds: new Set(['A']),
	hiddenNodeIds: new Set(['C']),
};

describe('entry exports', () => {
	it('exports logical filtered relationships once without conflating opposite directions', () => {
		const data = selectExportEntries({
			...projection,
			edges: [...projection.edges, projection.edges[0]!],
		});
		expect(data.nodes.map((node) => node.id)).toEqual(['A', 'B']);
		expect(data.edges.map((edge) => edge.id)).toEqual(['ab', 'ba']);
	});
	it('exports a selected relationship with its endpoints and groups with induced relationships', () => {
		const edge = selectExportEntries(projection, undefined, {
			edgeId: 'ab',
		});
		expect(edge.edges.map((item) => item.id)).toEqual(['ab']);
		expect(edge.nodes.map((item) => item.id)).toEqual(['A', 'B']);
		const group = selectExportEntries(
			projection,
			undefined,
			{ groupId: 'g' },
			new Map([['A', 'g']]),
		);
		expect(group.nodes.map((item) => item.id)).toEqual(['A']);
		expect(group.edges).toEqual([]);
	});
	it('omits metadata by default, snapshots opted-in values, and supports nodes/edges independently', () => {
		const state = { ...createWorkspaceState(100), projection };
		const data = createEntryDocument(state, options);
		expect(data.nodes[0]).not.toHaveProperty('metadata');
		const opted = createEntryDocument(state, {
			...options,
			includeMetadata: true,
			entries: 'nodes',
		});
		expect(opted.edges).toEqual([]);
		expect(opted.nodes[0]?.metadata).toEqual({ secret: 'optional' });
		expect(opted.nodes[0]?.metadata).not.toBe(
			projection.nodes[0]?.metadata,
		);
		expect(
			createEntryDocument(state, { ...options, entries: 'edges' }).nodes,
		).toEqual([]);
		expect(() =>
			createEntryDocument(state, { ...options, entryScope: 'selection' }),
		).toThrow('No visible selection');
	});
	it('quotes CSV commas, quotes and line breaks, prevents formulas, and preserves Unicode', async () => {
		expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
		for (const text of ['=1+1', ' +SUM(A1)', '@cmd', '-1', '\t=1'])
			expect(csvCell(text)).toBe(`"'${text}"`);
		expect(csvCell(-1)).toBe('"-1"');
		const data = createEntryDocument(
			{ ...createWorkspaceState(100), projection },
			options,
		);
		const blob = serializeEntries(data, 'csv');
		expect(new Uint8Array(await blob.arrayBuffer()).slice(0, 3)).toEqual(
			new Uint8Array([239, 187, 191]),
		);
		expect(await blob.text()).toContain('标签');
		expect(
			JSON.parse(await serializeEntries(data, 'json').text()),
		).toMatchObject({ format: 'meta-graph-entries', version: 1 });
	});
	it('escapes Markdown labels and URL syntax and changes only the final export extension', async () => {
		const data = createEntryDocument(
			{ ...createWorkspaceState(100), projection },
			options,
		);
		data.nodes[0]!.title = '[click]<script>';
		data.nodes[0]!.path = 'javascript:bad(foo)#x.md';
		const text = await serializeEntries(data, 'md').text();
		expect(text).toContain('\\[click\\]\\<script\\>');
		expect(text).toContain('javascript%3Abad%28foo%29%23x.md');
		expect(exportFilename('../知识图.png', 'svg')).toBe('-知识图.svg');
		expect(exportFilename('Chart.svg', 'csv')).toBe('Chart.csv');
	});
});

describe('vector logical edges', () => {
	it('collapses routed segments, preserves true endpoints, and never exports bend elements', () => {
		const graph: RuntimeGraph = new Graph({ multi: true });
		const node: RuntimeNodeAttributes = {
			x: 0,
			y: 0,
			label: 'A',
			size: 5,
			color: '#fff',
			path: 'A.md',
			folder: '',
			tags: [],
			domains: [],
		};
		graph.addNode('A', node);
		graph.addNode('B', { ...node, x: 50 });
		graph.addNode('bend', { ...node, x: 25, isBend: true });
		const edge: RuntimeEdgeAttributes = {
			relation: 'related',
			size: 1,
			color: '#fff',
			hidden: false,
			label: '',
			forceLabel: false,
			type: 'line',
			lineStyle: 'solid',
			logicalEdgeId: 'ab',
			logicalSource: 'A',
			logicalTarget: 'B',
		};
		graph.addDirectedEdgeWithKey('segment1', 'A', 'bend', edge);
		graph.addDirectedEdgeWithKey('segment2', 'bend', 'B', {
			...edge,
			label: 'Actual label',
		});
		const result = logicalExportEdges(graph, undefined, projection.edges);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: 'ab',
			source: 'A',
			target: 'B',
			attributes: { label: 'Actual label' },
		});
		graph.setNodeAttribute('B', 'hidden', true);
		expect(logicalExportEdges(graph)).toEqual([]);
	});
});
