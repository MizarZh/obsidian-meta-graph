import { describe, expect, it, vi } from 'vitest';
import { syncRendererDisplaySettings } from '../ui/workspace/renderer-display-sync';
import type { WorkspaceStateChanges } from '../ui/workspace/change-tracker';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('renderer display sync', () => {
	it('applies changed display settings to renderer', () => {
		const renderer = createRenderer();
		const state = {
			...createWorkspaceState(200),
			fadeDistance: 2,
			labelSize: 18,
		};

		syncRendererDisplaySettings(renderer, state, {
			...noChanges(),
			fadeDistanceChanged: true,
			labelSizeChanged: true,
		});

		expect(renderer.setFadeDistance).toHaveBeenCalledWith(2);
		expect(renderer.setLabelSize).toHaveBeenCalledWith(18);
		expect(renderer.setLabelPosition).not.toHaveBeenCalled();
	});
});

function createRenderer() {
	return {
		setFadeDistance: vi.fn(),
		setLabelSize: vi.fn(),
		setLabelPosition: vi.fn(),
		setLabelOffset: vi.fn(),
		setLabelColor: vi.fn(),
		setLabelTheme: vi.fn(),
		setLabelBackgroundOpacity: vi.fn(),
		setLabelDensity: vi.fn(),
		setForceLabels: vi.fn(),
	};
}

function noChanges(): WorkspaceStateChanges {
	return {
		manualLayoutChanged: false,
		fadeDistanceChanged: false,
		labelSizeChanged: false,
		labelPositionChanged: false,
		labelOffsetChanged: false,
		labelColorChanged: false,
		labelThemeChanged: false,
		labelBackgroundOpacityChanged: false,
		labelDensityChanged: false,
		cubeFaceOpacityChanged: false,
		forceLabelsChanged: false,
		graphForceSettingsChanged: false,
		forceLayoutChanged: false,
		styleRulesChanged: false,
		graphVisibilityChanged: false,
		shouldRebuild: false,
		fitAfterRender: false,
		forceLayout: false,
	};
}
