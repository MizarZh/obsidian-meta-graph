import { describe, expect, it } from 'vitest';
import {
	canDockPayloadTargetNode,
	getDockDragKey,
} from '../ui/dock-drag';
import type { DockDragPayload } from '../ui/dock-types';

describe('dock drag helpers', () => {
	it('builds stable drag keys for notes and templates', () => {
		expect(getDockDragKey(notePayload('A.md'))).toBe('note:A.md');
		expect(
			getDockDragKey({
				kind: 'template',
				templateId: 'daily',
				label: 'Daily',
			}),
		).toBe('template:daily');
	});

	it('prevents note payloads from targeting themselves', () => {
		expect(canDockPayloadTargetNode(notePayload('A.md'), 'A.md')).toBe(false);
		expect(canDockPayloadTargetNode(notePayload('A.md'), 'B.md')).toBe(true);
		expect(
			canDockPayloadTargetNode(
				{ kind: 'template', templateId: 'daily', label: 'Daily' },
				'A.md',
			),
		).toBe(true);
	});
});

function notePayload(notePath: string): DockDragPayload {
	return {
		kind: 'note',
		notePath,
		label: notePath,
		direction: 'from-dock-to-graph',
		relationField: 'leads-to',
	};
}
