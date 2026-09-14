import { describe, expect, it } from 'vitest';
import {
	MeshLambertMaterial,
	ShaderLib,
	Mesh,
	CylinderGeometry,
	TubeGeometry,
	QuadraticBezierCurve3,
	Vector3,
} from 'three';
import { applyForce3DLinkPattern } from '@/graph/renderers/force-3d/force-3d-link-material';

describe('Force 3D link patterns', () => {
	it.each(['dashed', 'dotted', 'dash-dot'] as const)(
		'cuts %s gaps along straight and curved geometry',
		(style) => {
			const material = new MeshLambertMaterial();
			applyForce3DLinkPattern(material, style, 2);
			const shader = { ...ShaderLib.lambert, uniforms: {} } as Parameters<
				typeof material.onBeforeCompile
			>[0];
			material.onBeforeCompile(shader, undefined as never);
			expect(shader.vertexShader).toContain('metaGraphLinkUv = uv;');
			expect(shader.fragmentShader).toContain('discard;');
			expect(shader.fragmentShader).toContain(
				'metaGraphLinkLength / 2.000000',
			);
			const cylinder = new CylinderGeometry(1, 1, 1);
			const mesh = new Mesh(cylinder, material);
			mesh.scale.z = 100;
			material.onBeforeRender(
				undefined as never,
				undefined as never,
				undefined as never,
				cylinder,
				mesh,
				undefined as never,
			);
			expect(shader.uniforms.metaGraphLinkLength!.value).toBe(100);
			expect(shader.uniforms.metaGraphLinkCurved!.value).toBe(0);
			const curve = new QuadraticBezierCurve3(
				new Vector3(),
				new Vector3(50, 80, 0),
				new Vector3(100, 0, 0),
			);
			const tube = new TubeGeometry(curve);
			material.onBeforeRender(
				undefined as never,
				undefined as never,
				undefined as never,
				tube,
				mesh,
				undefined as never,
			);
			expect(shader.uniforms.metaGraphLinkLength!.value).toBeCloseTo(
				curve.getLength(),
			);
			expect(shader.uniforms.metaGraphLinkLength!.value).toBeGreaterThan(
				100,
			);
			expect(shader.uniforms.metaGraphLinkCurved!.value).toBe(1);
			cylinder.dispose();
			tube.dispose();
			material.dispose();
		},
	);

	it('uses distinct shader programs for each pattern and leaves solid unchanged', () => {
		const keys = (['solid', 'dashed', 'dotted', 'dash-dot'] as const).map(
			(style) => {
				const material = new MeshLambertMaterial();
				const original = material.customProgramCacheKey();
				applyForce3DLinkPattern(material, style, 2);
				if (style === 'solid')
					expect(material.customProgramCacheKey()).toBe(original);
				return material.customProgramCacheKey();
			},
		);
		expect(new Set(keys).size).toBe(4);
	});
});
