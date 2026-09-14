import type * as Three from 'three';
import type { LinkLineStyle } from '@/core/types';

/** Keep force-graph's cylinders/tubes, picking, and arrows; cut gaps in ink. */
export function applyForce3DLinkPattern(
	material: Three.MeshLambertMaterial,
	style: LinkLineStyle,
	width: number,
): void {
	if (style === 'solid') return;
	const length = { value: 1 };
	const curved = { value: 0 };
	const unit = Math.max(1, width);
	const period = style === 'dotted' ? 4 : style === 'dash-dot' ? 14 : 10;
	const discard =
		style === 'dotted'
			? 'phase > 1.0'
			: style === 'dash-dot'
				? '(phase > 6.0 && phase < 9.0) || phase > 10.0'
				: 'phase > 6.0';
	material.onBeforeCompile = (shader) => {
		shader.uniforms.metaGraphLinkLength = length;
		shader.uniforms.metaGraphLinkCurved = curved;
		shader.vertexShader =
			`varying vec2 metaGraphLinkUv;\n${shader.vertexShader}`.replace(
				'#include <uv_vertex>',
				'#include <uv_vertex>\nmetaGraphLinkUv = uv;',
			);
		shader.fragmentShader = `varying vec2 metaGraphLinkUv;
uniform float metaGraphLinkLength;
uniform float metaGraphLinkCurved;
${shader.fragmentShader}`.replace(
			'#include <clipping_planes_fragment>',
			`#include <clipping_planes_fragment>
float along = mix(1.0 - metaGraphLinkUv.y, metaGraphLinkUv.x, metaGraphLinkCurved);
float phase = mod(along * metaGraphLinkLength / ${unit.toFixed(6)}, ${period.toFixed(1)});
if (${discard}) discard;`,
		);
	};
	material.customProgramCacheKey = () => `meta-graph-link-${style}-${unit}`;
	material.onBeforeRender = (
		_renderer,
		_scene,
		_camera,
		geometry,
		object,
	) => {
		const tube = geometry as Three.TubeGeometry;
		curved.value = geometry.type === 'TubeGeometry' ? 1 : 0;
		length.value = curved.value
			? tube.parameters.path.getLength()
			: Math.abs(object.scale.z);
	};
}
