import { describe, expect, it } from 'vitest';
import { createWorkspaceState } from '../workspace/workspace-state';
import { cloneSerializable } from '../workspace/workspace-persistence';
import {
	createDefaultMetaGraphDocument,
	serializeMetaGraphState,
} from '../workspace/meta-graph-model';

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
		expect(activeChart?.layout.spacing).toBe(1);
		expect(activeChart?.query.maxNodes).toBe(200);
		expect(saved).not.toHaveProperty('selectedNodeId');
		expect(saved).not.toHaveProperty('projection');
		expect(saved).not.toHaveProperty('availableFolders');
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

		const restored = createWorkspaceState(300, 1.5, document);

		expect(restored.mode).toBe('flow');
		expect(restored.fadeDistance).toBe(2);
		expect(restored.flowSpacing).toBe(2);
		expect(restored.query.maxNodes).toBe(50);
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

		const restored = createWorkspaceState(300, 1.5, document);

		expect(arcChart?.name).toBe('Arc diagram');
		expect(arcChart?.layout.engine).toBe('arc');
		expect(restored.mode).toBe('arc');
		expect(restored.arcSpacing).toBe(1.5);
		expect(restored.arcDirection).toBe('left');
	});

	it('clones proxy-backed serializable state', () => {
		const value = new Proxy(
			{ nested: new Proxy({ value: 1 }, {}) },
			{},
		);

		expect(cloneSerializable(value)).toEqual({ nested: { value: 1 } });
	});
});
