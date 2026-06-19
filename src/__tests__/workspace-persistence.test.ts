import { describe, expect, it } from 'vitest';
import { createWorkspaceState } from '../workspace/workspace-state';
import {
	cloneSerializable,
	serializeWorkspaceState,
} from '../workspace/workspace-persistence';

describe('workspace persistence', () => {
	it('serializes editable workspace configuration without runtime state', () => {
		const state = createWorkspaceState(200, 2);
		state.selectedNodeId = 'selected.md';
		state.availableFolders = ['folder'];

		const saved = serializeWorkspaceState(state);

		expect(saved.fadeDistance).toBe(2);
		expect(saved.graphSpacing).toBe(1);
		expect(saved.flowSpacing).toBe(1);
		expect(saved.query.maxNodes).toBe(200);
		expect(saved).not.toHaveProperty('selectedNodeId');
		expect(saved).not.toHaveProperty('projection');
		expect(saved).not.toHaveProperty('availableFolders');
	});

	it('restores a saved workspace while preserving the current node limit', () => {
		const saved = serializeWorkspaceState(createWorkspaceState(200, 2));
		saved.mode = 'flow';
		saved.graphSpacing = 1.5;
		saved.flowSpacing = 2;
		saved.query.maxNodes = 50;

		const restored = createWorkspaceState(300, 1.5, saved);

		expect(restored.mode).toBe('flow');
		expect(restored.fadeDistance).toBe(2);
		expect(restored.graphSpacing).toBe(1.5);
		expect(restored.flowSpacing).toBe(2);
		expect(restored.query.maxNodes).toBe(300);
	});

	it('clones proxy-backed serializable state', () => {
		const value = new Proxy(
			{ nested: new Proxy({ value: 1 }, {}) },
			{},
		);

		expect(cloneSerializable(value)).toEqual({ nested: { value: 1 } });
	});
});
