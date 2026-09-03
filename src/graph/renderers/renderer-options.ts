import type {
	LabelPosition,
	ManualLayoutConfig,
	ThreeLabelResolution,
} from '../../core/types';
import type { RuntimeGraph } from '../model/graphology-adapter';
import type { GraphPalette } from '../styles/graph-styles';
import type { RendererKind } from './renderer-capabilities';

/** Settings shared by every renderer implementation. */
export interface RendererBaseOptions {
	graph: RuntimeGraph;
	container: HTMLElement;
	palette: GraphPalette;
	fadeDistance: number;
	labelSize: number;
	labelBold: boolean;
	labelItalic: boolean;
	labelPosition: LabelPosition;
	labelOffset: number;
	labelLightTextColor: string;
	labelLightBackgroundColor: string;
	labelLightBackgroundOpacity: number;
	labelDarkTextColor: string;
	labelDarkBackgroundColor: string;
	labelDarkBackgroundOpacity: number;
	labelDensity: number;
	forceLabels: boolean;
	threeLabelResolution: ThreeLabelResolution;
	isStale: () => boolean;
}

export interface SigmaRendererOptions extends RendererBaseOptions {
	scaleLabelsWithZoom: boolean;
}

export interface Force3DRendererOptions extends RendererBaseOptions {
	enableForceLayout: boolean;
}

export interface Cube3DRendererOptions extends RendererBaseOptions {
	manualLayout: ManualLayoutConfig;
	cubeFaceOpacity: number;
	cubeSize: number;
	cubeFreeCamera: boolean;
	/** Kept in the factory contract for parity; Cube does not use force layout. */
	enableForceLayout: boolean;
}

/** Complete factory input assembled by the workspace renderer adapter. */
export interface GraphRendererOptions extends RendererBaseOptions {
	kind: RendererKind;
	manualLayout: ManualLayoutConfig;
	scaleLabelsWithZoom: boolean;
	cubeFaceOpacity: number;
	cubeSize: number;
	cubeFreeCamera: boolean;
	enableForceLayout: boolean;
}
