import { NodeProgram } from 'sigma/rendering';
import type { NodeDisplayData, RenderParams } from 'sigma/types';
import { floatColor } from 'sigma/utils';
import type { ProgramInfo } from 'sigma/rendering';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';

type NodeShapeUniform = 'u_sizeRatio' | 'u_correctionRatio' | 'u_matrix';

const VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute vec2 a_corner;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

const float bias = 255.0 / 254.0;

void main() {
  float diameter = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = diameter * 0.5 * a_corner;
  vec2 position = a_position + diffVector;
  gl_Position = vec4((u_matrix * vec3(position, 1)).xy, 0, 1);

  v_diffVector = diffVector;
  v_radius = diameter * 0.5;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;

const SQUARE_FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
uniform float u_correctionRatio;

void main(void) {
  float border = u_correctionRatio * 2.0;
  float dist = max(abs(v_diffVector.x), abs(v_diffVector.y)) - v_radius + border;

  #ifdef PICKING_MODE
  if (dist > border) gl_FragColor = vec4(0.0);
  else gl_FragColor = v_color;
  #else
  float t = dist > border ? 1.0 : (dist > 0.0 ? dist / border : 0.0);
  gl_FragColor = mix(v_color, vec4(0.0), t);
  #endif
}
`;

const DIAMOND_FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
uniform float u_correctionRatio;

void main(void) {
  float border = u_correctionRatio * 2.0;
	float dist = abs(v_diffVector.x) + abs(v_diffVector.y) - v_radius + border;

  #ifdef PICKING_MODE
  if (dist > border) gl_FragColor = vec4(0.0);
  else gl_FragColor = v_color;
  #else
  float t = dist > border ? 1.0 : (dist > 0.0 ? dist / border : 0.0);
  gl_FragColor = mix(v_color, vec4(0.0), t);
  #endif
}
`;

const TRIANGLE_FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
uniform float u_correctionRatio;

void main(void) {
  vec2 p = v_diffVector / v_radius;
  float edge0 = 0.5 * (p.y + 1.0) - 0.8660254 * p.x;
  float edge1 = 0.5 - p.y;
  float edge2 = 0.5 * p.y + 0.8660254 * p.x + 0.5;
  float dist = -min(min(edge0, edge1), edge2) * v_radius;
  float border = u_correctionRatio * 2.0;

  #ifdef PICKING_MODE
  if (dist > border) gl_FragColor = vec4(0.0);
  else gl_FragColor = v_color;
  #else
  float t = dist > border ? 1.0 : (dist > 0.0 ? dist / border : 0.0);
  gl_FragColor = mix(v_color, vec4(0.0), t);
  #endif
}
`;

const HEXAGON_FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
uniform float u_correctionRatio;

void main(void) {
  vec2 p = v_diffVector / v_radius;
  vec2 q = abs(p);
  float edge = min(
    0.8660254 - q.x,
    0.8660254 - 0.8660254 * q.y - 0.5 * q.x
  );
  float dist = -edge * v_radius;
  float border = u_correctionRatio * 2.0;

  #ifdef PICKING_MODE
  if (dist > border) gl_FragColor = vec4(0.0);
  else gl_FragColor = v_color;
  #else
  float t = dist > border ? 1.0 : (dist > 0.0 ? dist / border : 0.0);
  gl_FragColor = mix(v_color, vec4(0.0), t);
  #endif
}
`;

const STAR_FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
uniform float u_correctionRatio;

const float PI = 3.14159265359;

float cross2(vec2 left, vec2 right) {
  return left.x * right.y - left.y * right.x;
}

void main(void) {
  vec2 p = v_diffVector / v_radius;
  float angle = atan(p.x, -p.y);
  float sector = mod(
    angle + 2.0 * PI + PI / 5.0,
    2.0 * PI / 5.0
  ) - PI / 5.0;
  float side = sector < 0.0 ? -1.0 : 1.0;
  vec2 outer = vec2(0.0, -1.0);
  vec2 inner = vec2(
    side * sin(PI / 5.0) * 0.42,
    -cos(PI / 5.0) * 0.42
  );
  vec2 edge = inner - outer;
  vec2 direction = normalize(vec2(sin(sector), -cos(sector)));
  float boundary = cross2(outer, edge) / cross2(direction, edge);
  float dist = (length(p) - boundary) * v_radius;
  float border = u_correctionRatio * 2.0;

  #ifdef PICKING_MODE
  if (dist > border) gl_FragColor = vec4(0.0);
  else gl_FragColor = v_color;
  #else
  float t = dist > border ? 1.0 : (dist > 0.0 ? dist / border : 0.0);
  gl_FragColor = mix(v_color, vec4(0.0), t);
  #endif
}
`;

const SQUARE_CORNER_DATA = [
	[-1, -1],
	[1, -1],
	[1, 1],
	[-1, -1],
	[1, 1],
	[-1, 1],
];

const DIAMOND_CORNER_DATA = [
	[-1, 0],
	[0, -1],
	[1, 0],
	[-1, 0],
	[1, 0],
	[0, 1],
];

function createNodePolygonDefinition(
	fragmentShaderSource: string,
	cornerData: number[][],
) {
	return {
		VERTICES: 6,
		VERTEX_SHADER_SOURCE,
		FRAGMENT_SHADER_SOURCE: fragmentShaderSource,
		METHOD: WebGLRenderingContext.TRIANGLES,
		UNIFORMS: ['u_sizeRatio', 'u_correctionRatio', 'u_matrix'] as const,
		ATTRIBUTES: [
			{
				name: 'a_position',
				size: 2,
				type: WebGLRenderingContext.FLOAT,
			},
			{ name: 'a_size', size: 1, type: WebGLRenderingContext.FLOAT },
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
				name: 'a_corner',
				size: 2,
				type: WebGLRenderingContext.FLOAT,
			},
		],
		CONSTANT_DATA: cornerData,
	};
}

abstract class NodePolygonProgram extends NodeProgram<
	NodeShapeUniform,
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
> {
	processVisibleItem(
		nodeIndex: number,
		startIndex: number,
		data: NodeDisplayData,
	): void {
		const color = floatColor(data.color);
		this.array[startIndex++] = data.x;
		this.array[startIndex++] = data.y;
		this.array[startIndex++] = data.size;
		this.array[startIndex++] = color;
		this.array[startIndex] = nodeIndex;
	}

	setUniforms(
		params: RenderParams,
		{ gl, uniformLocations }: ProgramInfo<NodeShapeUniform>,
	): void {
		gl.uniform1f(
			uniformLocations.u_correctionRatio,
			params.correctionRatio,
		);
		gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
		gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
	}
}

export class NodeSquareProgram extends NodePolygonProgram {
	getDefinition() {
		return createNodePolygonDefinition(
			SQUARE_FRAGMENT_SHADER_SOURCE,
			SQUARE_CORNER_DATA,
		);
	}
}

export class NodeDiamondProgram extends NodePolygonProgram {
	getDefinition() {
		return createNodePolygonDefinition(
			DIAMOND_FRAGMENT_SHADER_SOURCE,
			DIAMOND_CORNER_DATA,
		);
	}
}

export class NodeTriangleProgram extends NodePolygonProgram {
	getDefinition() {
		return createNodePolygonDefinition(
			TRIANGLE_FRAGMENT_SHADER_SOURCE,
			SQUARE_CORNER_DATA,
		);
	}
}

export class NodeHexagonProgram extends NodePolygonProgram {
	getDefinition() {
		return createNodePolygonDefinition(
			HEXAGON_FRAGMENT_SHADER_SOURCE,
			SQUARE_CORNER_DATA,
		);
	}
}

export class NodeStarProgram extends NodePolygonProgram {
	getDefinition() {
		return createNodePolygonDefinition(
			STAR_FRAGMENT_SHADER_SOURCE,
			SQUARE_CORNER_DATA,
		);
	}
}
