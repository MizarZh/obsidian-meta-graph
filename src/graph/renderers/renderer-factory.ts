import { Cube3DRenderer } from './cube-3d/cube-3d-renderer';
import { Force3DRenderer } from './force-3d/force-3d-renderer';
import type { GraphRenderer } from './renderer-capabilities';
import type {
	Cube3DRendererOptions,
	Force3DRendererOptions,
	GraphRendererOptions,
	SigmaRendererOptions,
} from './renderer-options';
import { SigmaRenderer } from './sigma/sigma-renderer';

export async function createGraphRenderer(
	options: GraphRendererOptions,
): Promise<GraphRenderer | undefined> {
	if (options.kind === 'force-3d') {
		const forceOptions: Force3DRendererOptions = {
			graph: options.graph,
			container: options.container,
			palette: options.palette,
			fadeDistance: options.fadeDistance,
			labelSize: options.labelSize,
			labelBold: options.labelBold,
			labelItalic: options.labelItalic,
			labelPosition: options.labelPosition,
			labelOffset: options.labelOffset,
			labelLightTextColor: options.labelLightTextColor,
			labelLightBackgroundColor: options.labelLightBackgroundColor,
			labelLightBackgroundOpacity: options.labelLightBackgroundOpacity,
			labelDarkTextColor: options.labelDarkTextColor,
			labelDarkBackgroundColor: options.labelDarkBackgroundColor,
			labelDarkBackgroundOpacity: options.labelDarkBackgroundOpacity,
			labelDensity: options.labelDensity,
			forceLabels: options.forceLabels,
			threeLabelResolution: options.threeLabelResolution,
			enableForceLayout: options.enableForceLayout,
			isStale: options.isStale,
		};
		return Force3DRenderer.create(forceOptions);
	}

	if (options.kind === 'cube-3d') {
		const cubeOptions: Cube3DRendererOptions = {
			graph: options.graph,
			container: options.container,
			palette: options.palette,
			fadeDistance: options.fadeDistance,
			labelSize: options.labelSize,
			labelBold: options.labelBold,
			labelItalic: options.labelItalic,
			labelPosition: options.labelPosition,
			labelOffset: options.labelOffset,
			labelLightTextColor: options.labelLightTextColor,
			labelLightBackgroundColor: options.labelLightBackgroundColor,
			labelLightBackgroundOpacity: options.labelLightBackgroundOpacity,
			labelDarkTextColor: options.labelDarkTextColor,
			labelDarkBackgroundColor: options.labelDarkBackgroundColor,
			labelDarkBackgroundOpacity: options.labelDarkBackgroundOpacity,
			labelDensity: options.labelDensity,
			forceLabels: options.forceLabels,
			threeLabelResolution: options.threeLabelResolution,
			manualLayout: options.manualLayout,
			cubeFaceOpacity: options.cubeFaceOpacity,
			cubeSize: options.cubeSize,
			cubeFreeCamera: options.cubeFreeCamera,
			enableForceLayout: options.enableForceLayout,
			isStale: options.isStale,
		};
		return Cube3DRenderer.create(cubeOptions);
	}

	const sigmaOptions: SigmaRendererOptions = {
		graph: options.graph,
		container: options.container,
		palette: options.palette,
		fadeDistance: options.fadeDistance,
		labelSize: options.labelSize,
		labelBold: options.labelBold,
		labelItalic: options.labelItalic,
		labelPosition: options.labelPosition,
		labelOffset: options.labelOffset,
		labelLightTextColor: options.labelLightTextColor,
		labelLightBackgroundColor: options.labelLightBackgroundColor,
		labelLightBackgroundOpacity: options.labelLightBackgroundOpacity,
		labelDarkTextColor: options.labelDarkTextColor,
		labelDarkBackgroundColor: options.labelDarkBackgroundColor,
		labelDarkBackgroundOpacity: options.labelDarkBackgroundOpacity,
		labelDensity: options.labelDensity,
		forceLabels: options.forceLabels,
		threeLabelResolution: options.threeLabelResolution,
		scaleLabelsWithZoom: options.scaleLabelsWithZoom,
		isStale: options.isStale,
	};
	return new SigmaRenderer(sigmaOptions);
}
