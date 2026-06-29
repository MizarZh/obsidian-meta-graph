import { describe, expect, it } from 'vitest';
import { getWorkspaceGraphForceSettings } from '../ui/workspace/graph-settings';

describe('workspace graph force settings', () => {
	it('maps workspace graph force fields to simulation settings', () => {
		expect(
			getWorkspaceGraphForceSettings({
				graphCenterForce: 1,
				graphRepelForce: 2,
				graphLinkForce: 3,
				graphDragLinkForce: 4,
				graphReturnForce: 5,
				graphLinkDistance: 6,
			}),
		).toEqual({
			centerForce: 1,
			repelForce: 2,
			linkForce: 3,
			dragLinkForce: 4,
			returnForce: 5,
			linkDistance: 6,
		});
	});
});
