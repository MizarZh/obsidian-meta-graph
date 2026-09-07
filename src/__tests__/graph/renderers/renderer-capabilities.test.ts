import { describe, expect, it } from 'vitest';
import {
	getModeCapabilities,
	getRendererKindForMode,
	type RendererCapabilities,
} from '@/graph/renderers/renderer-capabilities';

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

	it('uses the chart renderer choice for every planar mode', () => {
		expect(getRendererKindForMode('graph')).toBe('sigma');
		expect(getRendererKindForMode('graph', 'g6')).toBe('g6');
		for (const mode of [
			'free',
			'flow',
			'arc',
			'hierarchical-edge-bundling',
		] as const) {
			expect(getRendererKindForMode(mode, 'g6')).toBe('g6');
			expect(getRendererKindForMode(mode)).toBe('sigma');
		}
		expect(getRendererKindForMode('cube', 'g6')).toBe('cube-3d');
		expect(getRendererKindForMode('graph-3d', 'g6')).toBe('force-3d');
	});
});
