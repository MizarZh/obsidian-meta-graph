import { describe, expect, it } from 'vitest';
import {
	getModeCapabilities,
	type RendererCapabilities,
} from '../graph/renderers/renderer-capabilities';

const declaredCapabilities: RendererCapabilities = {
	kind: 'cube-3d',
	supportsGroupOverlay: false,
	supportsLayoutGroupGeometry: false,
	supportsManualLayout: true,
	supportsEdgePicking: false,
	supportsNodeDragging: true,
	supportsConnectionMoveScheduling: true,
	supportsExternal2DForceSimulation: false,
};

describe('renderer capabilities', () => {
	it('keeps mode policy separate from renderer implementation capabilities', () => {
		expect(getModeCapabilities('free')).toMatchObject({
			rendererKind: 'sigma',
			usesExternal2DForceSimulation: false,
			supportsFreeNodeDrag: true,
			supportsManualGroups: true,
		});
		expect(getModeCapabilities('cube')).toMatchObject({
			rendererKind: 'cube-3d',
			supportsGroups: true,
			supportsManualGroups: false,
		});
		expect(getModeCapabilities('graph')).toMatchObject({
			rendererKind: 'sigma',
			usesExternal2DForceSimulation: true,
		});
	});

	it('defines a typed implementation capability shape', () => {
		expect(declaredCapabilities).toMatchObject({
			kind: 'cube-3d',
			supportsManualLayout: true,
			supportsConnectionMoveScheduling: true,
		});
	});
});
