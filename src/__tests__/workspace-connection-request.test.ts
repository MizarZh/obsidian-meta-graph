import { describe, expect, it } from 'vitest';
import {
	normalizeConnectionRequest,
	normalizeDockConnectionRequest,
} from '../workspace/actions/connection-request';

describe('workspace connection request', () => {
	it('trims fields while preserving node ids', () => {
		expect(
			normalizeConnectionRequest(' leads-to ', 'Source.md', 'Target.md'),
		).toEqual({
			sourceNodeId: 'Source.md',
			targetNodeId: 'Target.md',
			field: 'leads-to',
		});
	});

	it('rejects blank fields and blank endpoints', () => {
		expect(
			normalizeConnectionRequest('   ', 'Source.md', 'Target.md'),
		).toBeNull();
		expect(
			normalizeConnectionRequest('leads-to', '', 'Target.md'),
		).toBeNull();
		expect(
			normalizeConnectionRequest('leads-to', 'Source.md', ''),
		).toBeNull();
		expect(
			normalizeConnectionRequest('leads-to', '   ', 'Target.md'),
		).toBeNull();
		expect(
			normalizeConnectionRequest('leads-to', 'Source.md', '   '),
		).toBeNull();
	});

	it('rejects self connections', () => {
		expect(
			normalizeConnectionRequest('leads-to', 'Source.md', 'Source.md'),
		).toBeNull();
	});

	it('maps dock-to-graph direction', () => {
		expect(
			normalizeDockConnectionRequest(
				'Dock.md',
				'Graph.md',
				'from-dock-to-graph',
				' leads-to ',
			),
		).toEqual({
			sourceNodeId: 'Dock.md',
			targetNodeId: 'Graph.md',
			field: 'leads-to',
		});
	});

	it('maps graph-to-dock direction', () => {
		expect(
			normalizeDockConnectionRequest(
				'Dock.md',
				'Graph.md',
				'from-graph-to-dock',
				' leads-to ',
			),
		).toEqual({
			sourceNodeId: 'Graph.md',
			targetNodeId: 'Dock.md',
			field: 'leads-to',
		});
	});
});
