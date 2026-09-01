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
import { getParallelEdgeGap } from '../../../layouts/parallel-routes';

const VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform vec2 u_resolution;

varying vec4 v_color;
varying float v_distance;

const float minThickness = 1.7;
const float bias = 255.0 / 254.0;

void main() {
	vec2 normal = a_normal * a_normalCoef;
	vec2 position = mix(a_positionStart, a_positionEnd, a_positionCoef);
	float normalLength = length(normal);
	vec2 unitNormal = normalLength > 0.0 ? normal / normalLength : normal;
	float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);
	float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;
	vec2 startClip = (u_matrix * vec3(a_positionStart, 1.0)).xy;
	vec2 endClip = (u_matrix * vec3(a_positionEnd, 1.0)).xy;

	gl_Position = vec4(
		(u_matrix * vec3(position + unitNormal * webGLThickness, 1.0)).xy,
		0.0,
		1.0
	);
	v_distance = length((endClip - startClip) * u_resolution * 0.5) * a_positionCoef;

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
		'u_matrix' | 'u_sizeRatio' | 'u_correctionRatio' | 'u_resolution',
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
					'u_resolution',
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
			const offset = getParallelOffset(sourceData, targetData, data);
			this.array[startIndex++] = sourceData.x + unitNormalX * offset;
			this.array[startIndex++] = sourceData.y + unitNormalY * offset;
			this.array[startIndex++] = targetData.x + unitNormalX * offset;
			this.array[startIndex++] = targetData.y + unitNormalY * offset;
			this.array[startIndex++] = unitNormalX * thickness;
			this.array[startIndex++] = unitNormalY * thickness;
			this.array[startIndex++] = floatColor(data.color);
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
			gl.uniform2f(
				uniformLocations.u_resolution!,
				params.width * params.pixelRatio,
				params.height * params.pixelRatio,
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

void main(void) {
	float position = mod(v_distance, ${cycle.toFixed(1)});
	if (!(${drawRanges.join(' || ')})) {
		discard;
	}
	gl_FragColor = v_color;
}
`;

	return createLineProgram(fragmentShaderSource);
}

const SolidEdgeProgram = createLineProgram(/* glsl */ `
precision mediump float;

varying vec4 v_color;

void main(void) {
	gl_FragColor = v_color;
}
`);

const DashedEdgeProgram = createPatternedEdgeProgram([10, 7]);
const DottedEdgeProgram = createPatternedEdgeProgram([2, 5]);
const DashDotEdgeProgram = createPatternedEdgeProgram([10, 5, 2, 5]);

const ARROW_HEAD_VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec2 a_position;
attribute vec2 a_normal;
attribute float a_radius;
attribute float a_arrowSize;
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

varying vec4 v_color;
varying vec3 v_barycentric;

const float bias = 255.0 / 254.0;

void main() {
	float minThickness = u_minEdgeThickness;
	float normalLength = length(a_normal);
	vec2 unitNormal = a_normal / normalLength;
	float pixelsThickness = max(normalLength / u_sizeRatio, minThickness);
	float webGLThickness = pixelsThickness * u_correctionRatio;
	float webGLNodeRadius = a_radius * 2.0 * u_correctionRatio / u_sizeRatio;
	float arrowScale = max(a_arrowSize, 0.25);
	float webGLArrowHeadLength =
		webGLThickness * u_lengthToThicknessRatio * 2.0 * arrowScale;
	float webGLArrowHeadThickness =
		webGLThickness * u_widenessToThicknessRatio * arrowScale;

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

	gl_Position = vec4((u_matrix * vec3(a_position + delta, 1.0)).xy, 0.0, 1.0);
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
		| 'u_widenessToThicknessRatio',
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
						name: 'a_arrowSize',
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
			const offset = getParallelOffset(sourceData, targetData, data);
			const color = floatColor(data.color);
			const arrowSizeValue = (
				data as EdgeDisplayData & { arrowSize?: number }
			).arrowSize;
			const arrowSize =
				typeof arrowSizeValue === 'number' ? arrowSizeValue : 1;
			let dx = x2 - x1;
			let dy = y2 - y1;
			const edgeLength = Math.hypot(dx, dy);
			const unitNormalX = edgeLength ? -dy / edgeLength : 0;
			const unitNormalY = edgeLength ? dx / edgeLength : 0;
			const shiftedX1 = x1 + unitNormalX * offset;
			const shiftedY1 = y1 + unitNormalY * offset;
			const shiftedX2 = x2 + unitNormalX * offset;
			const shiftedY2 = y2 + unitNormalY * offset;
			dx = shiftedX2 - shiftedX1;
			dy = shiftedY2 - shiftedY1;
			let length = dx * dx + dy * dy;
			let normalX = 0;
			let normalY = 0;
			if (length) {
				length = 1 / Math.sqrt(length);
				normalX = -dy * length * thickness;
				normalY = dx * length * thickness;
			}
			this.array[startIndex++] = shiftedX2;
			this.array[startIndex++] = shiftedY2;
			this.array[startIndex++] = -normalX;
			this.array[startIndex++] = -normalY;
			this.array[startIndex++] = radius;
			this.array[startIndex++] = arrowSize;
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
		}
	};
}

const FilledArrowHeadProgram = createArrowHeadProgram(
	FILLED_ARROW_HEAD_FRAGMENT_SHADER_SOURCE,
);
const ChevronArrowHeadProgram = createArrowHeadProgram(
	CHEVRON_ARROW_HEAD_FRAGMENT_SHADER_SOURCE,
	{
		lengthToThicknessRatio: 2.25,
		widenessToThicknessRatio: 2.75,
	},
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
	sourceData: Pick<NodeDisplayData, 'x' | 'y' | 'size'>,
	targetData: Pick<NodeDisplayData, 'x' | 'y' | 'size'>,
	data: {
		size?: number;
		logicalEdgeId?: string;
		parallelLane?: number;
		parallelCount?: number;
		parallelDirection?: 1 | -1;
	},
): number {
	const edge = data;
	if (edge.logicalEdgeId || (edge.parallelCount ?? 1) <= 1) {
		return 0;
	}
	const lane = edge.parallelLane ?? 0;
	if (!lane) {
		return 0;
	}
	const length = Math.hypot(
		targetData.x - sourceData.x,
		targetData.y - sourceData.y,
	);
	if (length <= 0.001) {
		return 0;
	}
	const gap = getParallelEdgeGap(
		length,
		sourceData.size,
		targetData.size,
		data.size,
	);
	return lane * (edge.parallelDirection ?? 1) * gap;
}
