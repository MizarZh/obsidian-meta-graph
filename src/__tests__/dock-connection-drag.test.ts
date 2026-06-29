import { describe, expect, it } from 'vitest';
import {
	createDockConnectionDragState,
	updateDockConnectionDragState,
} from '../ui/dock/connection-drag';

describe('dock connection drag state', () => {
	it('creates connection drag state from dock payload and pointer positions', () => {
		expect(
			createDockConnectionDragState(
				{ kind: 'template', templateId: 'daily', label: 'Daily' },
				{ x: 10, y: 20 },
				{ x: 30, y: 40 },
			),
		).toEqual({
			sourceNodeId: 'template:daily',
			x1: 10,
			y1: 20,
			x2: 30,
			y2: 40,
		});
	});

	it('updates pointer endpoint and target node', () => {
		expect(
			updateDockConnectionDragState(
				{
					sourceNodeId: 'note:A.md',
					x1: 1,
					y1: 2,
					x2: 3,
					y2: 4,
				},
				{ x: 50, y: 60 },
				'B.md',
			),
		).toEqual({
			sourceNodeId: 'note:A.md',
			targetNodeId: 'B.md',
			x1: 1,
			y1: 2,
			x2: 50,
			y2: 60,
		});
	});
});
