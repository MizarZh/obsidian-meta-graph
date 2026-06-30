import type { WorkspaceState } from '../../core/types';
import type { WorkspaceStateChanges } from './change-tracker';

interface DisplayRenderer {
	setFadeDistance(value: number): void;
	setLabelSize(value: number): void;
	setLabelPosition(value: WorkspaceState['labelPosition']): void;
	setLabelOffset(value: number): void;
	setLabelColor(value: string): void;
	setLabelTheme(state: Pick<
		WorkspaceState,
		| 'labelLightTextColor'
		| 'labelLightBackgroundColor'
		| 'labelLightBackgroundOpacity'
		| 'labelDarkTextColor'
		| 'labelDarkBackgroundColor'
		| 'labelDarkBackgroundOpacity'
	>): void;
	setLabelBackgroundOpacity(value: number): void;
	setLabelDensity(value: number): void;
	setForceLabels(value: boolean): void;
	setCubeFaceOpacity?(value: number): void;
}

export function syncRendererDisplaySettings(
	renderer: DisplayRenderer | undefined,
	state: WorkspaceState,
	changes: WorkspaceStateChanges,
): void {
	if (changes.fadeDistanceChanged) {
		renderer?.setFadeDistance(state.fadeDistance);
	}
	if (changes.labelSizeChanged) {
		renderer?.setLabelSize(state.labelSize);
	}
	if (changes.labelPositionChanged) {
		renderer?.setLabelPosition(state.labelPosition);
	}
	if (changes.labelOffsetChanged) {
		renderer?.setLabelOffset(state.labelOffset);
	}
	if (changes.labelColorChanged) {
		renderer?.setLabelColor(state.labelColor);
	}
	if (changes.labelThemeChanged) {
		renderer?.setLabelTheme(state);
	}
	if (changes.labelBackgroundOpacityChanged) {
		renderer?.setLabelBackgroundOpacity(state.labelBackgroundOpacity);
	}
	if (changes.labelDensityChanged) {
		renderer?.setLabelDensity(state.labelDensity);
	}
	if (changes.cubeFaceOpacityChanged && renderer?.setCubeFaceOpacity) {
		renderer.setCubeFaceOpacity(state.cubeFaceOpacity);
	}
	if (changes.forceLabelsChanged) {
		renderer?.setForceLabels(state.forceLabels);
	}
}
