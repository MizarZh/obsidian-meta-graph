import { truncateLabel } from '@/graph/label-text';

/** Rasterize DOM capsules while document fonts are still available. SVG image
 * foreignObject cannot load the workspace's web fonts and may reflow titles. */
export function snapshotGroupCapsule(
	source: HTMLElement,
	scale: number,
): HTMLImageElement | undefined {
	const style = source.ownerDocument.defaultView!.getComputedStyle(source);
	if (style.display === 'none' || !source.offsetWidth || !source.offsetHeight)
		return;
	const number = (value: string) => Number.parseFloat(value) || 0;
	const width =
		number(style.width) +
		(style.boxSizing === 'border-box'
			? 0
			: number(style.paddingLeft) +
				number(style.paddingRight) +
				number(style.borderLeftWidth) +
				number(style.borderRightWidth));
	const height =
		number(style.height) +
		(style.boxSizing === 'border-box'
			? 0
			: number(style.paddingTop) +
				number(style.paddingBottom) +
				number(style.borderTopWidth) +
				number(style.borderBottomWidth));
	const canvas = source.ownerDocument.createElement('canvas');
	// Flow titles carry their own zoom transform in addition to export resolution.
	const transform = new DOMMatrixReadOnly(
		style.transform === 'none' ? undefined : style.transform,
	);
	const ratio = scale * Math.max(1, Math.hypot(transform.a, transform.b));
	canvas.width = Math.ceil(width * ratio);
	canvas.height = Math.ceil(height * ratio);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas is unavailable');
	context.scale(canvas.width / width, canvas.height / height);
	const border = Number.parseFloat(style.borderTopWidth) || 0;
	context.beginPath();
	context.roundRect(
		border / 2,
		border / 2,
		width - border,
		height - border,
		Math.min(height / 2, Number.parseFloat(style.borderTopLeftRadius) || 0),
	);
	context.fillStyle = style.backgroundColor;
	context.fill();
	if (border) {
		context.strokeStyle = style.borderTopColor;
		context.lineWidth = border;
		context.stroke();
	}
	context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	context.letterSpacing =
		style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
	const left = border + Number.parseFloat(style.paddingLeft);
	const right = border + Number.parseFloat(style.paddingRight);
	const available = Math.max(0, width - left - right);
	const text = truncateLabel(
		source.textContent ?? '',
		// CSS layout rounds to fractional pixels; do not ellipsize a fitting
		// title because its computed width lost a subpixel during serialization.
		available + 1 / 64,
		(value) => context.measureText(value).width,
	);
	context.fillStyle = style.color;
	context.textBaseline = 'middle';
	context.fillText(text, left, height / 2);
	const image = source.ownerDocument.createElement('img');
	image.setAttribute('width', String(width));
	image.setAttribute('height', String(height));
	image.src = canvas.toDataURL('image/png');
	return image;
}
