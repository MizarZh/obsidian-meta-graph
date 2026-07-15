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
			threeLabelResolution: 'high' as const,
			labelItalic: true,
		};

		syncRendererDisplaySettings(renderer, state, {
			...noChanges(),
			fadeDistanceChanged: true,
			labelSizeChanged: true,
			threeLabelResolutionChanged: true,
			labelItalicChanged: true,
		});

		expect(renderer.setFadeDistance).toHaveBeenCalledWith(2);
		expect(renderer.setLabelSize).toHaveBeenCalledWith(18);
		expect(renderer.setThreeLabelResolution).toHaveBeenCalledWith('high');
		expect(renderer.setLabelItalic).toHaveBeenCalledWith(true);
		expect(renderer.setLabelPosition).not.toHaveBeenCalled();
	});
});

function createRenderer() {
	return {
		setFadeDistance: vi.fn(),
		setLabelSize: vi.fn(),
		setThreeLabelResolution: vi.fn(),
		setLabelBold: vi.fn(),
		setLabelItalic: vi.fn(),
		setLabelPosition: vi.fn(),
		setLabelOffset: vi.fn(),
		setLabelColor: vi.fn(),
		setLabelTheme: vi.fn(),
		setLabelBackgroundOpacity: vi.fn(),
		setLabelDensity: vi.fn(),
		setCubeFaceOpacity: vi.fn(),
		setCubeSize: vi.fn(),
		setCubeFreeCamera: vi.fn(),
		setForceLabels: vi.fn(),
	};
}

function noChanges(): WorkspaceStateChanges {
	return {
		manualLayoutChanged: false,
		fadeDistanceChanged: false,
		labelSizeChanged: false,
		threeLabelResolutionChanged: false,
		labelBoldChanged: false,
		labelItalicChanged: false,
		labelPositionChanged: false,
		labelOffsetChanged: false,
		labelColorChanged: false,
		labelThemeChanged: false,
		labelBackgroundOpacityChanged: false,
		labelDensityChanged: false,
		cubeFaceOpacityChanged: false,
		cubeSizeChanged: false,
		cubeFreeCameraChanged: false,
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
