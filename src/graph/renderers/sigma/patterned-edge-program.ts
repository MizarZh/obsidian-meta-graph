import {
	EdgeProgram,
	createEdgeArrowHeadProgram,
	createEdgeCompoundProgram,
} from 'sigma/rendering';
import type { EdgeDisplayData, NodeDisplayData, RenderParams } from 'sigma/types';
import { floatColor } from 'sigma/utils';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';

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

function createPatternedEdgeProgram(dashLength: number, gapLength: number) {
	const fragmentShaderSource = /* glsl */ `
precision mediump float;

varying vec4 v_color;
varying float v_distance;

void main(void) {
	float cycle = ${dashLength.toFixed(1)} + ${gapLength.toFixed(1)};
	if (mod(v_distance, cycle) > ${dashLength.toFixed(1)}) {
		discard;
	}
	gl_FragColor = v_color;
}
`;

	return class PatternedEdgeProgram extends EdgeProgram<
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
			const length = Math.hypot(dx, dy);
			const normalX = length ? (-dy / length) * thickness : 0;
			const normalY = length ? (dx / length) * thickness : 0;

			this.array[startIndex++] = sourceData.x;
			this.array[startIndex++] = sourceData.y;
			this.array[startIndex++] = targetData.x;
			this.array[startIndex++] = targetData.y;
			this.array[startIndex++] = normalX;
			this.array[startIndex++] = normalY;
			this.array[startIndex++] = floatColor(data.color);
			this.array[startIndex] = edgeIndex;
		}

		setUniforms(
			params: RenderParams,
			{ gl, uniformLocations }: ProgramInfo,
		): void {
			gl.uniformMatrix3fv(uniformLocations.u_matrix!, false, params.matrix);
			gl.uniform1f(uniformLocations.u_sizeRatio!, params.sizeRatio);
			gl.uniform1f(uniformLocations.u_correctionRatio!, params.correctionRatio);
			gl.uniform2f(
				uniformLocations.u_resolution!,
				params.width * params.pixelRatio,
				params.height * params.pixelRatio,
			);
		}
	};
}

const DashedEdgeProgram = createPatternedEdgeProgram(10, 7);
const DottedEdgeProgram = createPatternedEdgeProgram(2, 5);

export const DashedArrowEdgeProgram = createEdgeCompoundProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
>([DashedEdgeProgram, createEdgeArrowHeadProgram()]);

export const DottedArrowEdgeProgram = createEdgeCompoundProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
>([DottedEdgeProgram, createEdgeArrowHeadProgram()]);

export { DashedEdgeProgram, DottedEdgeProgram };
