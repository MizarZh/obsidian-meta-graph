import { EdgeProgram, createEdgeCompoundProgram } from 'sigma/rendering';
import type {
	EdgeDisplayData,
	NodeDisplayData,
	RenderParams,
} from 'sigma/types';
import { floatColor } from 'sigma/utils';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import {
	getCanonicalParallelLane,
	getParallelLaneOffset,
} from '../../model/parallel-edges';
import {
	EDGE_ARROW_RATIOS,
	EDGE_DASH_PATTERNS,
} from './sigma-edge-visual-metrics';

const VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;
attribute float a_parallelLane;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_feather;
uniform vec2 u_resolution;

varying vec4 v_color;
varying float v_distance;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const float bias = 255.0 / 254.0;

void main() {
	vec2 normal = a_normal * a_normalCoef;
	vec2 position = mix(a_positionStart, a_positionEnd, a_positionCoef);
	float normalLength = length(normal);
	vec2 unitNormal = normalLength > 0.0 ? normal / normalLength : normal;
	float pixelsThickness = max(
		normalLength,
		u_minEdgeThickness * u_sizeRatio
	);
	float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;
	vec2 startClip = (u_matrix * vec3(a_positionStart, 1.0)).xy;
	vec2 endClip = (u_matrix * vec3(a_positionEnd, 1.0)).xy;
	vec2 graphNormalClip = (u_matrix * vec3(a_normal, 0.0)).xy;
	vec2 screenNormal = vec2(
		graphNormalClip.x * u_resolution.x * 0.5,
		-graphNormalClip.y * u_resolution.y * 0.5
	);
	float screenNormalLength = length(screenNormal);
	vec2 screenSide = screenNormalLength > 0.001
		? screenNormal / screenNormalLength
		: vec2(0.0, 0.0);
	float laneOffset = a_parallelLane * 4.0;
	vec2 laneClip = vec2(
		screenSide.x * laneOffset * 2.0 / u_resolution.x,
		-screenSide.y * laneOffset * 2.0 / u_resolution.y
	);
	vec2 positionClip = (
		u_matrix * vec3(position + unitNormal * webGLThickness, 1.0)
	).xy;

	gl_Position = vec4(positionClip + laneClip, 0.0, 1.0);
	v_distance = length((endClip - startClip) * u_resolution * 0.5)
		* a_positionCoef;
	v_normal = unitNormal;
	v_thickness = webGLThickness / u_zoomRatio;
	v_feather =
		u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;

	#ifdef PICKING_MODE
	v_color = a_id;
	#else
	v_color = a_color;
	#endif

	v_color.a *= bias;
}
`;

interface ProgramInfo {
	gl: WebGLRenderingContext;
	uniformLocations: Record<string, WebGLUniformLocation>;
}

function createLineProgram(fragmentShaderSource: string) {
	return class LineEdgeProgram extends EdgeProgram<
		| 'u_matrix'
		| 'u_sizeRatio'
		| 'u_correctionRatio'
		| 'u_minEdgeThickness'
		| 'u_zoomRatio'
		| 'u_pixelRatio'
		| 'u_feather'
		| 'u_resolution'
		| 'u_patternScale',
		RuntimeNodeAttributes,
		RuntimeEdgeAttributes
	> {
		getDefinition() {
			return {
				VERTICES: 6,
				VERTEX_SHADER_SOURCE,
				FRAGMENT_SHADER_SOURCE: fragmentShaderSource,
				METHOD: WebGLRenderingContext.TRIANGLES,
				UNIFORMS: [
					'u_matrix',
					'u_sizeRatio',
					'u_correctionRatio',
					'u_minEdgeThickness',
					'u_zoomRatio',
					'u_pixelRatio',
					'u_feather',
					'u_resolution',
					'u_patternScale',
				] as const,
				ATTRIBUTES: [
					{
						name: 'a_positionStart',
						size: 2,
						type: WebGLRenderingContext.FLOAT,
					},
					{
						name: 'a_positionEnd',
						size: 2,
						type: WebGLRenderingContext.FLOAT,
					},
					{
						name: 'a_normal',
						size: 2,
						type: WebGLRenderingContext.FLOAT,
					},
					{
						name: 'a_color',
						size: 4,
						type: WebGLRenderingContext.UNSIGNED_BYTE,
						normalized: true,
					},
					{
						name: 'a_id',
						size: 4,
						type: WebGLRenderingContext.UNSIGNED_BYTE,
						normalized: true,
					},
					{
						name: 'a_parallelLane',
						size: 1,
						type: WebGLRenderingContext.FLOAT,
					},
				],
				CONSTANT_ATTRIBUTES: [
					{
						name: 'a_positionCoef',
						size: 1,
						type: WebGLRenderingContext.FLOAT,
					},
					{
						name: 'a_normalCoef',
						size: 1,
						type: WebGLRenderingContext.FLOAT,
					},
				],
				CONSTANT_DATA: [
					[0, 1],
					[0, -1],
					[1, 1],
					[1, 1],
					[0, -1],
					[1, -1],
				],
			};
		}

		processVisibleItem(
			edgeIndex: number,
			startIndex: number,
			sourceData: NodeDisplayData,
			targetData: NodeDisplayData,
			data: EdgeDisplayData,
		): void {
			const thickness = data.size || 1;
			const dx = targetData.x - sourceData.x;
			const dy = targetData.y - sourceData.y;
			const edgeLength = Math.hypot(dx, dy);
			const unitNormalX = edgeLength ? -dy / edgeLength : 0;
			const unitNormalY = edgeLength ? dx / edgeLength : 0;
			this.array[startIndex++] = sourceData.x;
			this.array[startIndex++] = sourceData.y;
			this.array[startIndex++] = targetData.x;
			this.array[startIndex++] = targetData.y;
			this.array[startIndex++] = unitNormalX * thickness;
			this.array[startIndex++] = unitNormalY * thickness;
			this.array[startIndex++] = floatColor(data.color);
			this.array[startIndex++] = edgeIndex;
			this.array[startIndex] = getCanonicalParallelLane(
				data as unknown as RuntimeEdgeAttributes,
			);
		}

		setUniforms(
			params: RenderParams,
			{ gl, uniformLocations }: ProgramInfo,
		): void {
			gl.uniformMatrix3fv(
				uniformLocations.u_matrix!,
				false,
				params.matrix,
			);
			gl.uniform1f(uniformLocations.u_sizeRatio!, params.sizeRatio);
			gl.uniform1f(
				uniformLocations.u_correctionRatio!,
				params.correctionRatio,
			);
			gl.uniform1f(
				uniformLocations.u_minEdgeThickness!,
				params.minEdgeThickness,
			);
			gl.uniform1f(uniformLocations.u_zoomRatio!, params.zoomRatio);
			gl.uniform1f(uniformLocations.u_pixelRatio!, params.pixelRatio);
			gl.uniform1f(
				uniformLocations.u_feather!,
				params.antiAliasingFeather,
			);
			gl.uniform2f(
				uniformLocations.u_resolution!,
				params.width * params.pixelRatio,
				params.height * params.pixelRatio,
			);
			gl.uniform1f(
				uniformLocations.u_patternScale!,
				1 / Math.max(params.sizeRatio, 0.001),
			);
		}
	};
}

function createPatternedEdgeProgram(pattern: readonly number[]) {
	const cycle = pattern.reduce((total, length) => total + length, 0);
	let offset = 0;
	const drawRanges: string[] = [];
	for (const [index, length] of pattern.entries()) {
		if (index % 2 === 0) {
			drawRanges.push(
				`(position >= ${offset.toFixed(1)} && position < ${(offset + length).toFixed(1)})`,
			);
		}
		offset += length;
	}
	const fragmentShaderSource = /* glsl */ `
precision mediump float;

varying vec4 v_color;
varying float v_distance;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;
uniform float u_patternScale;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
	float position = mod(
		v_distance / max(u_patternScale, 0.001),
		${cycle.toFixed(1)}
	);
	if (!(${drawRanges.join(' || ')})) {
		discard;
	}
	#ifdef PICKING_MODE
	gl_FragColor = v_color;
	#else
	float distanceFromCenter = length(v_normal) * v_thickness;
	float featherMix = smoothstep(
		v_thickness - v_feather,
		v_thickness,
		distanceFromCenter
	);
	gl_FragColor = mix(v_color, transparent, featherMix);
	#endif
}
`;

	return createLineProgram(fragmentShaderSource);
}

const SolidEdgeProgram = createLineProgram(/* glsl */ `
precision mediump float;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
	#ifdef PICKING_MODE
	gl_FragColor = v_color;
	#else
	float distanceFromCenter = length(v_normal) * v_thickness;
	float featherMix = smoothstep(
		v_thickness - v_feather,
		v_thickness,
		distanceFromCenter
	);
	gl_FragColor = mix(v_color, transparent, featherMix);
	#endif
}
`);

const DashedEdgeProgram = createPatternedEdgeProgram(EDGE_DASH_PATTERNS.dashed);
const DottedEdgeProgram = createPatternedEdgeProgram(EDGE_DASH_PATTERNS.dotted);
const DashDotEdgeProgram = createPatternedEdgeProgram(
	EDGE_DASH_PATTERNS['dash-dot'],
);

const ARROW_HEAD_VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec2 a_position;
attribute vec2 a_normal;
attribute float a_radius;
attribute float a_arrowBaseSize;
attribute float a_arrowSize;
attribute float a_parallelLane;
attribute vec3 a_barycentric;

#ifdef PICKING_MODE
attribute vec4 a_id;
#else
attribute vec4 a_color;
#endif

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_lengthToThicknessRatio;
uniform float u_widenessToThicknessRatio;
uniform vec2 u_resolution;

varying vec4 v_color;
varying vec3 v_barycentric;

const float bias = 255.0 / 254.0;

void main() {
	float minThickness = u_minEdgeThickness;
	float normalLength = length(a_normal);
	vec2 unitNormal = normalLength > 0.0
		? a_normal / normalLength
		: vec2(0.0, -1.0);
	float webGLNodeRadius = a_radius * 2.0 * u_correctionRatio / u_sizeRatio;
	float arrowPixelsThickness = max(a_arrowBaseSize / u_sizeRatio, minThickness);
	float webGLArrowThickness = arrowPixelsThickness * u_correctionRatio;
	float arrowScale = max(a_arrowSize, 0.25);
	float webGLArrowHeadLength =
		webGLArrowThickness * u_lengthToThicknessRatio * 2.0 * arrowScale;
	float webGLArrowHeadThickness =
		webGLArrowThickness * u_widenessToThicknessRatio * arrowScale;

	float da = a_barycentric.x;
	float db = a_barycentric.y;
	float dc = a_barycentric.z;
	vec2 delta = vec2(
		da * (webGLNodeRadius * unitNormal.y)
		+ db * ((webGLNodeRadius + webGLArrowHeadLength) * unitNormal.y + webGLArrowHeadThickness * unitNormal.x)
		+ dc * ((webGLNodeRadius + webGLArrowHeadLength) * unitNormal.y - webGLArrowHeadThickness * unitNormal.x),
		da * (-webGLNodeRadius * unitNormal.x)
		+ db * (-(webGLNodeRadius + webGLArrowHeadLength) * unitNormal.x + webGLArrowHeadThickness * unitNormal.y)
		+ dc * (-(webGLNodeRadius + webGLArrowHeadLength) * unitNormal.x - webGLArrowHeadThickness * unitNormal.y)
	);
	vec2 positionClip = (u_matrix * vec3(a_position + delta, 1.0)).xy;
	vec2 graphNormalClip = (u_matrix * vec3(-a_normal, 0.0)).xy;
	vec2 screenNormal = vec2(
		graphNormalClip.x * u_resolution.x * 0.5,
		-graphNormalClip.y * u_resolution.y * 0.5
	);
	float screenNormalLength = length(screenNormal);
	vec2 screenSide = screenNormalLength > 0.001
		? screenNormal / screenNormalLength
		: vec2(0.0, 0.0);
	float laneOffset = a_parallelLane * 4.0;
	vec2 laneClip = vec2(
		screenSide.x * laneOffset * 2.0 / u_resolution.x,
		-screenSide.y * laneOffset * 2.0 / u_resolution.y
	);

	gl_Position = vec4(positionClip + laneClip, 0.0, 1.0);
	v_barycentric = a_barycentric;

	#ifdef PICKING_MODE
	v_color = a_id;
	#else
	v_color = a_color;
	#endif
	v_color.a *= bias;
}
`;

const FILLED_ARROW_HEAD_FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision mediump float;

varying vec4 v_color;

void main(void) {
	gl_FragColor = v_color;
}
`;

const CHEVRON_ARROW_HEAD_FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision mediump float;

varying vec4 v_color;
varying vec3 v_barycentric;

void main(void) {
	#ifdef PICKING_MODE
	gl_FragColor = v_color;
	#else
	// Keep only the two visible wings of the triangle: a hollow chevron.
	float wingDistance = min(v_barycentric.y, v_barycentric.z);
	// A slightly wider feather keeps the open wings readable at normal zoom.
	float alpha = 1.0 - smoothstep(0.07, 0.22, wingDistance);
	if (alpha < 0.01) {
		discard;
	}
	gl_FragColor = vec4(v_color.rgb, v_color.a * alpha);
	#endif
}
`;

function createArrowHeadProgram(
	fragmentShaderSource: string,
	options: {
		lengthToThicknessRatio?: number;
		widenessToThicknessRatio?: number;
	} = {},
) {
	const lengthToThicknessRatio = options.lengthToThicknessRatio ?? 2.5;
	const widenessToThicknessRatio = options.widenessToThicknessRatio ?? 2;
	return class ArrowHeadProgram extends EdgeProgram<
		| 'u_matrix'
		| 'u_sizeRatio'
		| 'u_correctionRatio'
		| 'u_minEdgeThickness'
		| 'u_lengthToThicknessRatio'
		| 'u_widenessToThicknessRatio'
		| 'u_resolution',
		RuntimeNodeAttributes,
		RuntimeEdgeAttributes
	> {
		getDefinition() {
			return {
				VERTICES: 3,
				VERTEX_SHADER_SOURCE: ARROW_HEAD_VERTEX_SHADER_SOURCE,
				FRAGMENT_SHADER_SOURCE: fragmentShaderSource,
				METHOD: WebGLRenderingContext.TRIANGLES,
				UNIFORMS: [
					'u_matrix',
					'u_sizeRatio',
					'u_correctionRatio',
					'u_minEdgeThickness',
					'u_lengthToThicknessRatio',
					'u_widenessToThicknessRatio',
					'u_resolution',
				] as const,
				ATTRIBUTES: [
					{
						name: 'a_position',
						size: 2,
						type: WebGLRenderingContext.FLOAT,
					},
					{
						name: 'a_normal',
						size: 2,
						type: WebGLRenderingContext.FLOAT,
					},
					{
						name: 'a_radius',
						size: 1,
						type: WebGLRenderingContext.FLOAT,
					},
					{
						name: 'a_arrowBaseSize',
						size: 1,
						type: WebGLRenderingContext.FLOAT,
					},
					{
						name: 'a_arrowSize',
						size: 1,
						type: WebGLRenderingContext.FLOAT,
					},
					{
						name: 'a_parallelLane',
						size: 1,
						type: WebGLRenderingContext.FLOAT,
					},
					{
						name: 'a_color',
						size: 4,
						type: WebGLRenderingContext.UNSIGNED_BYTE,
						normalized: true,
					},
					{
						name: 'a_id',
						size: 4,
						type: WebGLRenderingContext.UNSIGNED_BYTE,
						normalized: true,
					},
				],
				CONSTANT_ATTRIBUTES: [
					{
						name: 'a_barycentric',
						size: 3,
						type: WebGLRenderingContext.FLOAT,
					},
				],
				CONSTANT_DATA: [
					[1, 0, 0],
					[0, 1, 0],
					[0, 0, 1],
				],
			};
		}

		processVisibleItem(
			edgeIndex: number,
			startIndex: number,
			sourceData: NodeDisplayData,
			targetData: NodeDisplayData,
			data: EdgeDisplayData,
		): void {
			const thickness = data.size || 1;
			const radius = targetData.size || 1;
			const x1 = sourceData.x;
			const y1 = sourceData.y;
			const x2 = targetData.x;
			const y2 = targetData.y;
			const color = floatColor(data.color);
			const arrowSizeValue = (
				data as EdgeDisplayData & { arrowSize?: number }
			).arrowSize;
			const arrowSize =
				typeof arrowSizeValue === 'number' ? arrowSizeValue : 1;
			const arrowBaseSizeValue = (
				data as EdgeDisplayData & { arrowBaseSize?: number }
			).arrowBaseSize;
			const arrowBaseSize =
				typeof arrowBaseSizeValue === 'number'
					? arrowBaseSizeValue
					: thickness;
			let dx = x2 - x1;
			let dy = y2 - y1;
			let length = dx * dx + dy * dy;
			let normalX = 0;
			let normalY = 0;
			if (length) {
				length = 1 / Math.sqrt(length);
				normalX = -dy * length * thickness;
				normalY = dx * length * thickness;
			}
			this.array[startIndex++] = x2;
			this.array[startIndex++] = y2;
			this.array[startIndex++] = -normalX;
			this.array[startIndex++] = -normalY;
			this.array[startIndex++] = radius;
			this.array[startIndex++] = arrowBaseSize;
			this.array[startIndex++] = arrowSize;
			this.array[startIndex++] = getCanonicalParallelLane(
				data as unknown as RuntimeEdgeAttributes,
			);
			this.array[startIndex++] = color;
			this.array[startIndex] = edgeIndex;
		}

		setUniforms(
			params: RenderParams,
			{ gl, uniformLocations }: ProgramInfo,
		): void {
			gl.uniformMatrix3fv(
				uniformLocations.u_matrix!,
				false,
				params.matrix,
			);
			gl.uniform1f(uniformLocations.u_sizeRatio!, params.sizeRatio);
			gl.uniform1f(
				uniformLocations.u_correctionRatio!,
				params.correctionRatio,
			);
			gl.uniform1f(
				uniformLocations.u_minEdgeThickness!,
				params.minEdgeThickness,
			);
			gl.uniform1f(
				uniformLocations.u_lengthToThicknessRatio!,
				lengthToThicknessRatio,
			);
			gl.uniform1f(
				uniformLocations.u_widenessToThicknessRatio!,
				widenessToThicknessRatio,
			);
			gl.uniform2f(
				uniformLocations.u_resolution!,
				params.width * params.pixelRatio,
				params.height * params.pixelRatio,
			);
		}
	};
}

const FilledArrowHeadProgram = createArrowHeadProgram(
	FILLED_ARROW_HEAD_FRAGMENT_SHADER_SOURCE,
	EDGE_ARROW_RATIOS.filled,
);
const ChevronArrowHeadProgram = createArrowHeadProgram(
	CHEVRON_ARROW_HEAD_FRAGMENT_SHADER_SOURCE,
	EDGE_ARROW_RATIOS.chevron,
);

export const ArrowEdgeProgram = createEdgeCompoundProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
>([SolidEdgeProgram, FilledArrowHeadProgram]);

export const DashedArrowEdgeProgram = createEdgeCompoundProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
>([DashedEdgeProgram, FilledArrowHeadProgram]);

export const DottedArrowEdgeProgram = createEdgeCompoundProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
>([DottedEdgeProgram, FilledArrowHeadProgram]);

export const DashDotArrowEdgeProgram = createEdgeCompoundProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
>([DashDotEdgeProgram, FilledArrowHeadProgram]);

export const ChevronArrowEdgeProgram = createEdgeCompoundProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
>([SolidEdgeProgram, ChevronArrowHeadProgram]);

export const DashedChevronArrowEdgeProgram = createEdgeCompoundProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
>([DashedEdgeProgram, ChevronArrowHeadProgram]);

export const DottedChevronArrowEdgeProgram = createEdgeCompoundProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
>([DottedEdgeProgram, ChevronArrowHeadProgram]);

export const DashDotChevronArrowEdgeProgram = createEdgeCompoundProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
>([DashDotEdgeProgram, ChevronArrowHeadProgram]);

export {
	DashDotEdgeProgram,
	DashedEdgeProgram,
	DottedEdgeProgram,
	SolidEdgeProgram,
};

export function getParallelOffset(
	_sourceData: Pick<NodeDisplayData, 'x' | 'y' | 'size'>,
	_targetData: Pick<NodeDisplayData, 'x' | 'y' | 'size'>,
	data: {
		size?: number;
		logicalEdgeId?: string;
		parallelLane?: number;
		parallelCount?: number;
		parallelDirection?: 1 | -1;
	},
): number {
	// Edge labels are already in viewport pixels when Sigma calls the drawer;
	// keep their center on the same fixed-size lane as the WebGL route.
	const edge = data;
	if (edge.logicalEdgeId || (edge.parallelCount ?? 1) <= 1) {
		return 0;
	}
	return getParallelLaneOffset(edge, data.size);
}
