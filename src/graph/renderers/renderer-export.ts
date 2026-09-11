import type {
	GraphPosition,
	RuntimeGraph,
} from '@/graph/model/graphology-adapter';

export function snapshotPlanarPositions(
	graph: RuntimeGraph,
	readPosition: (id: string) => GraphPosition | undefined,
): void {
	graph.forEachNode((id, attributes) => {
		// G6 deliberately omits layout bend nodes from its scene.
		if (attributes.isBend || attributes.hidden) return;
		const position = readPosition(id);
		if (position) graph.mergeNodeAttributes(id, position);
	});
}

export interface ExportViewport {
	center: GraphPosition;
	/** Canonical graph units per CSS pixel. */
	unitsPerPixel: number;
}

export interface PngExportOptions {
	range: 'viewport' | 'graph';
	scale: number;
	background: 'theme' | 'white' | 'transparent';
	legend: boolean;
	filename: string;
}

export function exportDimensions(width: number, height: number, scale: number) {
	const result = {
		width: Math.round(width * scale),
		height: Math.round(height * scale),
	};
	if (
		![width, height, scale].every(Number.isFinite) ||
		width <= 0 ||
		height <= 0 ||
		![1, 2, 3].includes(scale)
	) {
		throw new Error('Invalid export dimensions');
	}
	if (
		result.width > 8192 ||
		result.height > 8192 ||
		result.width * result.height > 16_777_216
	) {
		throw new Error('Image is too large. Choose a lower resolution.');
	}
	return result;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(new Error('Unable to encode PNG')),
			'image/png',
		),
	);
}

/** Inspect only the perimeter; a complete graph must leave clear export padding. */
export function hasClippedExportContent(
	canvas: HTMLCanvasElement,
	scale: number,
): boolean {
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas is unavailable');
	const padding = Math.min(Math.ceil(4 * scale), canvas.width, canvas.height);
	const strips = [
		[0, 0, canvas.width, padding],
		[0, canvas.height - padding, canvas.width, padding],
		[0, 0, padding, canvas.height],
		[canvas.width - padding, 0, padding, canvas.height],
	];
	return strips.some(([x, y, width, height]) => {
		const pixels = context.getImageData(x!, y!, width!, height!).data;
		for (let index = 3; index < pixels.length; index += 4)
			if (pixels[index]! > 8) return true;
		return false;
	});
}

/** Inline computed styles and canvas pixels before any asynchronous boundary.
 * SVG foreignObject preserves the renderer's DOM/SVG groups and stacking order.
 * Data URLs keep this self-contained: export never fetches remote resources.
 */
export function snapshotElement(source: Element): Element {
	const document = source.ownerDocument;
	const styles = document.defaultView!.getComputedStyle(source);
	const target =
		source.localName === 'canvas'
			? document.createElement('img')
			: (source.cloneNode(false) as Element);
	if (source.localName === 'canvas') {
		target.setAttribute(
			'src',
			(source as HTMLCanvasElement).toDataURL('image/png'),
		);
	}
	for (const attribute of Array.from(target.attributes)) {
		if (attribute.name.startsWith('on'))
			target.removeAttribute(attribute.name);
	}
	const inline = (target as HTMLElement | SVGElement).style;
	for (const property of Array.from(styles)) {
		const value = styles.getPropertyValue(property);
		if (!value.includes('url(')) inline.setProperty(property, value);
	}
	inline.setProperty('animation', 'none');
	inline.setProperty('transition', 'none');
	if (source.localName !== 'canvas') {
		for (const child of Array.from(source.childNodes)) {
			if (child.nodeType === 1) {
				const element = child as Element;
				if (
					['script', 'style', 'link', 'iframe', 'img'].includes(
						element.localName,
					)
				)
					continue;
				target.appendChild(snapshotElement(element));
			} else if (child.nodeType === 3)
				target.appendChild(child.cloneNode());
		}
	}
	return target;
}

export async function rasterizeSnapshot(
	root: Element,
	width: number,
	height: number,
	scale: number,
): Promise<HTMLCanvasElement> {
	const dimensions = exportDimensions(width, height, scale);
	const document = root.ownerDocument;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(root)}</foreignObject></svg>`;
	const image = document.createElement('img');
	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () =>
			reject(new Error('Unable to render image snapshot'));
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	});
	const canvas = document.createElement('canvas');
	canvas.width = dimensions.width;
	canvas.height = dimensions.height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas is unavailable');
	context.drawImage(image, 0, 0);
	return canvas;
}
