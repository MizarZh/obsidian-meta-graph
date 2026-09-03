const REFERENCE_FONT_SIZE = 100;
const DEFAULT_MAX_ENTRIES = 10_000;

export interface CanvasFontSpec {
	family: string;
	weight: string | number;
	style?: string;
	size: number;
}

/**
 * Caches text widths at one reference size so zoom-dependent label sizes do not
 * create a new cache entry on every camera update.
 */
export class CanvasTextWidthCache {
	private readonly widths = new Map<string, number>();

	constructor(private readonly maxEntries = DEFAULT_MAX_ENTRIES) {}

	measure(
		context: CanvasRenderingContext2D,
		text: string,
		font: CanvasFontSpec,
	): number {
		if (!text || font.size <= 0) return 0;
		const style = font.style ?? 'normal';
		const key = `${style}\u0000${font.weight}\u0000${font.family}\u0000${text}`;
		let referenceWidth = this.widths.get(key);
		if (referenceWidth === undefined) {
			context.save();
			context.font = `${style} ${font.weight} ${REFERENCE_FONT_SIZE}px ${font.family}`;
			referenceWidth = context.measureText(text).width;
			context.restore();
			this.store(key, referenceWidth);
		}
		return (referenceWidth * font.size) / REFERENCE_FONT_SIZE;
	}

	clear(): void {
		this.widths.clear();
	}

	private store(key: string, width: number): void {
		if (this.maxEntries <= 0) return;
		if (this.widths.size >= this.maxEntries) {
			const oldestKey = this.widths.keys().next().value;
			if (oldestKey !== undefined) this.widths.delete(oldestKey);
		}
		this.widths.set(key, width);
	}
}
