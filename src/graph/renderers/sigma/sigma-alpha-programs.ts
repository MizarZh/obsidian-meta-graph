import { EdgeRectangleProgram, NodeCircleProgram } from 'sigma/rendering';
import type {
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes,
} from '@/graph/model/graphology-adapter';

/** Sigma blends with ONE / ONE_MINUS_SRC_ALPHA, including feathered pixels. */
export function premultiplySigmaVertexColors(source: string): string {
	return source.replace(
		'v_color.a *= bias;',
		`v_color.a *= bias;
#ifndef PICKING_MODE
  v_color.rgb *= v_color.a;
#endif`,
	);
}

export class AlphaNodeCircleProgram extends NodeCircleProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
> {
	getDefinition() {
		const definition = super.getDefinition();
		return {
			...definition,
			VERTEX_SHADER_SOURCE: premultiplySigmaVertexColors(
				definition.VERTEX_SHADER_SOURCE,
			),
		};
	}
}

export class AlphaEdgeRectangleProgram extends EdgeRectangleProgram<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes
> {
	getDefinition() {
		const definition = super.getDefinition();
		return {
			...definition,
			VERTEX_SHADER_SOURCE: premultiplySigmaVertexColors(
				definition.VERTEX_SHADER_SOURCE,
			),
		};
	}
}
