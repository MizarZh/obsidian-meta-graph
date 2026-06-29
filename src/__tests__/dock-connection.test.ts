import { describe, expect, it } from 'vitest';
import { resolveDockPayloadGraphAction } from '../ui/dock-connection';
import type { DockDragPayload } from '../ui/dock-types';

describe('dock payload graph action planning', () => {
	it('plans template creation actions', () => {
		const payload: DockDragPayload = {
			kind: 'template',
			templateId: 'daily',
			label: 'Daily',
		};

		expect(resolveDockPayloadGraphAction(payload, 'A.md')).toEqual({
			kind: 'create-from-template',
			payload,
			targetNodeId: 'A.md',
			direction: 'from-dock-to-graph',
		});
	});

	it('ignores broken notes', () => {
		expect(
			resolveDockPayloadGraphAction(
				{ kind: 'broken-note', notePath: 'Missing.md', label: 'Missing' },
				'A.md',
			),
		).toEqual({ kind: 'none' });
	});

	it('plans note connection actions', () => {
		expect(
			resolveDockPayloadGraphAction(
				{
					kind: 'note',
					notePath: 'Dock.md',
					label: 'Dock',
					direction: 'from-graph-to-dock',
					relationField: 'related',
				},
				'Graph.md',
			),
		).toEqual({
			kind: 'connect-note',
			notePath: 'Dock.md',
			targetNodeId: 'Graph.md',
			direction: 'from-graph-to-dock',
			relationField: 'related',
		});
	});
});
