import { describe, expect, it } from 'vitest';
import { createWorkspaceState } from '../workspace/state/workspace-state';
import { cloneSerializable } from '../workspace/state/persistence';
import {
	createDefaultMetaGraphDocument,
	normalizeMetaGraphDocument,
	serializeMetaGraphState,
} from '../workspace/meta-graph-model';
import {
	addCuratedFilePaths,
	removeCuratedFilePaths,
	renameCuratedFilePath,
} from '../workspace/state/curated-workspace';

describe('workspace persistence', () => {
	it('serializes editable chart configuration without runtime state', () => {
		const state = createWorkspaceState(200, 2);
		state.selectedNodeId = 'selected.md';
		state.availableFolders = ['folder'];

		const saved = serializeMetaGraphState(state);
		const activeChart = saved.charts.find(
			(chart) => chart.id === saved.activeChart,
		);

		expect(activeChart?.display.fadeDistance).toBe(2);
		expect(activeChart?.display.labelDensity).toBe(0.8);
		expect(activeChart?.display.forceLabels).toBe(false);
		expect(activeChart?.layout.spacing).toBe(1);
		expect(activeChart?.query.maxNodes).toBe(200);
		expect(saved).not.toHaveProperty('selectedNodeId');
		expect(saved).not.toHaveProperty('projection');
		expect(saved).not.toHaveProperty('availableFolders');
	});

	it('normalizes label density into the supported range', () => {
		const document = createDefaultMetaGraphDocument(200, 2);
		const graphChart = document.charts.find(
			(chart) => chart.id === 'knowledge-map',
		);
		if (graphChart) {
			graphChart.display.labelDensity = 3;
		}

		const restoredDocument = normalizeMetaGraphDocument(document, 300, 1.5);
		const restored = createWorkspaceState(300, 1.5, restoredDocument);

		expect(restored.labelDensity).toBe(1);
	});

	it('restores the active chart from a document', () => {
		const document = createDefaultMetaGraphDocument(200, 2);
		document.activeChart = 'learning-flow';
		const flowChart = document.charts.find(
			(chart) => chart.id === 'learning-flow',
		);
		if (flowChart) {
			flowChart.layout.spacing = 2;
			flowChart.query.maxNodes = 50;
		}

		const restoredDocument = normalizeMetaGraphDocument(document, 300, 1.5);
		const restored = createWorkspaceState(300, 1.5, restoredDocument);

		expect(restored.mode).toBe('flow');
		expect(restored.fadeDistance).toBe(2);
		expect(restored.flowSpacing).toBe(2);
		expect(restored.query.maxNodes).toBe(50);
	});

	it('persists connection field direction modes', () => {
		const document = createDefaultMetaGraphDocument(200, 2);
		document.connectionFields = ['leads-to', 'supports'];
		document.connectionFieldSpecs = [
			{ id: 'leads-to:directed', field: 'leads-to', mode: 'directed' },
			{ id: 'supports:bidirectional', field: 'supports', mode: 'bidirectional' },
			{ id: 'supports:reverse', field: 'supports', mode: 'reverse' },
		];
		document.connectionFieldModes = {
			'leads-to': 'directed',
			supports: 'reverse',
		};
		document.activeConnectionFieldSpecId = 'supports:reverse';

		const restoredDocument = normalizeMetaGraphDocument(document, 300, 1.5);
		const restored = createWorkspaceState(300, 1.5, restoredDocument);
		const saved = serializeMetaGraphState(restored);

		expect(restored.connectionFieldModes.supports).toBe('reverse');
		expect(restored.activeConnectionFieldSpecId).toBe(
			'supports:reverse',
		);
		expect(saved.connectionFieldModes).toEqual({
			'leads-to': 'directed',
			supports: 'reverse',
		});
	});

	it('allows one-way, two-way, and reverse entries for the same metadata field', () => {
		const document = createDefaultMetaGraphDocument(200, 2);
		document.connectionFields = ['leads-to'];
		document.connectionFieldSpecs = [
			{ id: 'leads-to:directed', field: 'leads-to', mode: 'directed' },
			{
				id: 'leads-to:bidirectional',
				field: 'leads-to',
				mode: 'bidirectional',
			},
			{ id: 'leads-to:reverse', field: 'leads-to', mode: 'reverse' },
		];
		document.activeConnectionFieldSpecId = 'leads-to:reverse';

		const restoredDocument = normalizeMetaGraphDocument(document, 300, 1.5);
		const restored = createWorkspaceState(300, 1.5, restoredDocument);

		expect(restored.connectionFields).toEqual(['leads-to']);
		expect(restored.connectionFieldSpecs).toEqual([
			{ id: 'leads-to:directed', field: 'leads-to', mode: 'directed' },
			{
				id: 'leads-to:bidirectional',
				field: 'leads-to',
				mode: 'bidirectional',
			},
			{ id: 'leads-to:reverse', field: 'leads-to', mode: 'reverse' },
		]);
		expect(restored.activeConnectionFieldSpecId).toBe(
			'leads-to:reverse',
		);
	});

	it('preserves connection field spec order', () => {
		const document = createDefaultMetaGraphDocument(200, 2);
		document.connectionFields = ['leads-to', 'supports'];
		document.connectionFieldSpecs = [
			{ id: 'supports:directed', field: 'supports', mode: 'directed' },
			{ id: 'leads-to:directed', field: 'leads-to', mode: 'directed' },
			{
				id: 'supports:bidirectional',
				field: 'supports',
				mode: 'bidirectional',
			},
			{ id: 'supports:reverse', field: 'supports', mode: 'reverse' },
		];

		const restoredDocument = normalizeMetaGraphDocument(document, 300, 1.5);
		const restored = createWorkspaceState(300, 1.5, restoredDocument);
		const saved = serializeMetaGraphState(restored);

		expect(saved.connectionFieldSpecs.map((spec) => spec.id)).toEqual([
			'supports:directed',
			'leads-to:directed',
			'supports:bidirectional',
			'supports:reverse',
		]);
	});

	it('creates and restores the arc diagram chart', () => {
		const document = createDefaultMetaGraphDocument(200, 2);
		const arcChart = document.charts.find(
			(chart) => chart.id === 'arc-diagram',
		);
		if (arcChart) {
			arcChart.layout.spacing = 1.5;
			arcChart.layout.arcDirection = 'left';
			document.activeChart = arcChart.id;
		}

		const restoredDocument = normalizeMetaGraphDocument(document, 300, 1.5);
		const restored = createWorkspaceState(300, 1.5, restoredDocument);

		expect(arcChart?.name).toBe('Arc diagram');
		expect(arcChart?.layout.engine).toBe('arc');
		expect(restored.mode).toBe('arc');
		expect(restored.arcSpacing).toBe(1.5);
		expect(restored.arcDirection).toBe('left');
	});

	it('restores a curated workspace chart without changing query charts', () => {
		const document = createDefaultMetaGraphDocument(200, 2);
		const graphChart = document.charts.find(
			(chart) => chart.id === 'knowledge-map',
		);
		if (graphChart) {
			graphChart.source = 'curated';
			graphChart.curated.files = [{ path: 'Projects/A.md' }];
			document.activeChart = graphChart.id;
		}

		const restored = createWorkspaceState(300, 1.5, document);
		const saved = serializeMetaGraphState(restored);

		expect(restored.chartSource).toBe('curated');
		expect(restored.curated.files).toEqual([{ path: 'Projects/A.md' }]);
		expect(saved.charts[0]?.source).toBe('curated');
		expect(saved.charts[1]?.source).toBe('query');
	});

	it('migrates legacy filter rules into a root filter group', () => {
		const document = createDefaultMetaGraphDocument(200, 2);
		const graphChart = document.charts.find(
			(chart) => chart.id === 'knowledge-map',
		);
		if (graphChart) {
			delete graphChart.query.filterRoot;
			graphChart.query.hiddenNodeRules = [
				{
					id: 'show-tags',
					action: 'show',
					field: 'file.tags',
					operator: 'contains',
					value: 'project',
				},
				{
					id: 'hide-archive',
					action: 'hide',
					field: 'file.folder',
					operator: 'is',
					value: 'Archive',
				},
			];
		}

		const legacyRestoredDocument = normalizeMetaGraphDocument(document, 300, 1.5);
		const restored = createWorkspaceState(300, 1.5, legacyRestoredDocument);

		expect(restored.query.filterRoot).toMatchObject({
			id: 'root',
			kind: 'group',
			mode: 'all',
		});
		expect(restored.query.filterRoot?.children).toHaveLength(2);
		expect(restored.query.filterRoot?.children[0]).toMatchObject({
			kind: 'group',
			mode: 'all',
		});
		expect(restored.query.filterRoot?.children[1]).toMatchObject({
			kind: 'group',
			mode: 'none',
		});
	});

	it('updates curated file paths while preserving missing entries', () => {
		const update = renameCuratedFilePath(
			{
				files: [
					{ path: 'Projects/A.md' },
					{ path: 'Projects/Missing.md' },
				],
				context: {
					enabled: false,
					depth: 0,
					includeOutgoingLinks: true,
					includeBacklinks: true,
					includeMetadataRelations: true,
				},
			},
			'Projects/A.md',
			'Projects/Renamed.md',
		);

		expect(update.changed).toBe(true);
		expect(update.curated.files).toEqual([
			{ path: 'Projects/Renamed.md' },
			{ path: 'Projects/Missing.md' },
		]);
	});

	it('adds and removes curated files in batches with de-duplication', () => {
		const curated = {
			files: [{ path: 'Projects/A.md' }],
			context: {
				enabled: false,
				depth: 0,
				includeOutgoingLinks: true,
				includeBacklinks: true,
				includeMetadataRelations: true,
			},
		};

		const added = addCuratedFilePaths(curated, [
			'Projects/A.md',
			'Projects/B.md',
			'Projects/C.md',
		]);
		const removed = removeCuratedFilePaths(added.curated, [
			'Projects/A.md',
			'Projects/C.md',
		]);

		expect(added.changed).toBe(true);
		expect(added.curated.files).toEqual([
			{ path: 'Projects/A.md' },
			{ path: 'Projects/B.md' },
			{ path: 'Projects/C.md' },
		]);
		expect(removed.changed).toBe(true);
		expect(removed.curated.files).toEqual([{ path: 'Projects/B.md' }]);
	});

	it('clones proxy-backed serializable state', () => {
		const value = new Proxy(
			{ nested: new Proxy({ value: 1 }, {}) },
			{},
		);

		expect(cloneSerializable(value)).toEqual({ nested: { value: 1 } });
	});
});
