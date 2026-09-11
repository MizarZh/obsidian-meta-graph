import type Sigma from 'sigma';
import type {
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes,
} from '@/graph/model/graphology-adapter';

const configured = new WeakSet<
	Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>
>();

/** Sigma 3 has no public pixel-ratio setter. Confine its backing-store adapter
 * to disposable export instances; never change window.devicePixelRatio.
 */
export function setSigmaExportResolution(
	sigma: Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>,
	ratio: number,
): void {
	if (configured.has(sigma)) return;
	configured.add(sigma);
	const internals = sigma as unknown as {
		pixelRatio: number;
		canvasContexts: Record<string, CanvasRenderingContext2D>;
		webGLContexts: Record<string, WebGLRenderingContext>;
	};
	const resize = sigma.resize.bind(sigma);
	sigma.resize = (force?: boolean) => {
		resize(force);
		internals.pixelRatio = ratio;
		const { width, height } = sigma.getDimensions();
		const canvases = sigma.getCanvases();
		for (const [id, canvas] of Object.entries(canvases)) {
			const w = Math.round(width * ratio),
				h = Math.round(height * ratio);
			if (canvas.width === w && canvas.height === h) continue;
			canvas.width = w;
			canvas.height = h;
			internals.canvasContexts[id]?.setTransform(
				ratio,
				0,
				0,
				ratio,
				0,
				0,
			);
			internals.webGLContexts[id]?.viewport(0, 0, w, h);
		}
		return sigma;
	};
	sigma.resize(true);
}
