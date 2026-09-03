import { describe, expect, it } from 'vitest';
import { resolveGroupCapabilities } from '../workspace/groups/group-policy';

describe('group capabilities', () => {
	it('separates membership and spatial policy', () => {
		expect(resolveGroupCapabilities('graph')).toMatchObject({
			membership: 'manual',
			spatial: 'automatic-region',
			canAssignManually: true,
		});
		expect(resolveGroupCapabilities('flow')).toMatchObject({
			membership: 'rule',
			spatial: 'layout-region',
			canAssignManually: true,
		});
		expect(resolveGroupCapabilities('free')).toMatchObject({
			spatial: 'fixed-frame',
			canMove: true,
			canResize: true,
		});
	});

	it('keeps Cube groups fixed and Graph 3D unavailable', () => {
		expect(resolveGroupCapabilities('cube')).toMatchObject({
			membership: 'system',
			spatial: 'surface',
			canCreate: false,
			canDelete: false,
			canAssignManually: true,
		});
		expect(resolveGroupCapabilities('graph-3d')).toMatchObject({
			available: false,
			spatial: 'none',
		});
	});
});
