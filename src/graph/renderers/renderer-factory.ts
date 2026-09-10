import type { GraphRenderer } from '@/graph/renderers/renderer-capabilities';
import type {
	Cube3DRendererOptions,
	Force3DRendererOptions,
	G6RendererOptions,
	GraphRendererOptions,
	SigmaRendererOptions,
} from '@/graph/renderers/renderer-options';

export async function createGraphRenderer(
	options: GraphRendererOptions,
): Promise<GraphRenderer | undefined> {
	if (options.isStale()) return undefined;
	if (options.kind === 'force-3d') {
		const { Force3DRenderer } =
			await import('@/graph/renderers/force-3d/force-3d-renderer');
		if (options.isStale()) return undefined;
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
		const { Cube3DRenderer } =
			await import('@/graph/renderers/cube-3d/cube-3d-renderer');
		if (options.isStale()) return undefined;
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

	if (options.kind === 'g6') {
		const { G6Renderer } = await import('@/graph/renderers/g6/g6-renderer');
		if (options.isStale()) return undefined;
		const g6Options: G6RendererOptions = {
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
			edgeRoutes: options.edgeRoutes,
		};
		return G6Renderer.create(g6Options);
	}

	const { SigmaRenderer } =
		await import('@/graph/renderers/sigma/sigma-renderer');
	if (options.isStale()) return undefined;
	const sigmaOptions: SigmaRendererOptions = {
		parallelEdgeStyle: options.parallelEdgeStyle,
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
