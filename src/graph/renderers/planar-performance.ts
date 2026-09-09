/** Opt-in, aggregate-only diagnostics. No node IDs, paths or text are recorded. */
const sessions = new Set<PlanarPerformance>();
const owners = new WeakMap<object, PlanarPerformance>();
let enabled = false;
let nextId = 0;
export function isPlanarPerformanceLoggingEnabled(): boolean {
	return enabled;
}
const WINDOW_MS = 5000;
const SAMPLE_LIMIT = 4096;

export function setPlanarPerformanceLogging(value: boolean): void {
	enabled = value;
	for (const session of sessions) session.setEnabled(value);
}

export function getPlanarPerformance(
	owner: object,
): PlanarPerformance | undefined {
	return enabled ? owners.get(owner) : undefined;
}

interface Options {
	owner: object;
	engine: 'g6' | 'sigma';
	container: HTMLElement;
	snapshot(): Record<string, number | boolean | string>;
	attach(session: PlanarPerformance): () => void;
}

export class PlanarPerformance {
	private readonly id = ++nextId;
	private active = false;
	private timer?: number;
	private detach?: () => void;
	private started = 0;
	private lastPaint?: number;
	private readonly metrics = new Map<
		string,
		{ count: number; total: number; max: number; samples: number[] }
	>();
	constructor(private readonly options: Options) {
		sessions.add(this);
		owners.set(options.owner, this);
		this.setEnabled(enabled);
	}

	setEnabled(value: boolean): void {
		if (value === this.active) return;
		const host = this.options.container.ownerDocument?.defaultView;
		if (value && (!host?.setInterval || !host.clearInterval)) return;
		this.active = value;
		this.metrics.clear();
		this.lastPaint = undefined;
		if (value) {
			this.started = performance.now();
			this.detach = this.options.attach(this);
			this.timer = host!.setInterval(() => this.flush(), WINDOW_MS);
		} else {
			if (this.timer !== undefined) host?.clearInterval(this.timer);
			this.timer = undefined;
			this.detach?.();
			this.detach = undefined;
		}
	}

	record(name: string, ms = 0): void {
		if (!this.active || !Number.isFinite(ms)) return;
		let metric = this.metrics.get(name);
		if (!metric) {
			metric = { count: 0, total: 0, max: 0, samples: [] };
			this.metrics.set(name, metric);
		}
		metric.count++;
		metric.total += ms;
		metric.max = Math.max(metric.max, ms);
		if (metric.samples.length < SAMPLE_LIMIT) metric.samples.push(ms);
	}

	paint(): void {
		const now = performance.now();
		this.record('mainPaint');
		// Exclude long idle gaps; this is a redraw interval, not monitor FPS.
		if (this.lastPaint !== undefined && now - this.lastPaint < 1000)
			this.record('activePaintInterval', now - this.lastPaint);
		this.lastPaint = now;
	}

	flush(): void {
		if (!this.active) return;
		const now = performance.now();
		if (this.metrics.size) {
			const bounds = this.options.container.getBoundingClientRect();
			const metrics = Object.fromEntries(
				[...this.metrics].map(([name, metric]) => {
					const sorted = [...metric.samples].sort((a, b) => a - b);
					const round = (value: number) =>
						Math.round(value * 100) / 100;
					return [
						name,
						{
							count: metric.count,
							meanMs: round(metric.total / metric.count),
							totalMs: round(metric.total),
							p50Ms: round(
								sorted[Math.floor((sorted.length - 1) * 0.5)] ??
									0,
							),
							p95Ms: round(
								sorted[Math.ceil((sorted.length - 1) * 0.95)] ??
									0,
							),
							maxMs: round(metric.max),
							sampled: sorted.length,
						},
					];
				}),
			);
			// eslint-disable-next-line obsidianmd/rule-custom-message -- Explicitly opted-in aggregate performance diagnostics.
			console.info(
				'[Meta Graph performance]',
				JSON.stringify({
					schema: 2,
					engine: this.options.engine,
					session: this.id,
					windowMs: Math.round(now - this.started),
					width: Math.round(bounds.width),
					height: Math.round(bounds.height),
					devicePixelRatio:
						this.options.container.ownerDocument.defaultView
							?.devicePixelRatio ?? 1,
					...this.options.snapshot(),
					metrics,
				}),
			);
		}
		this.metrics.clear();
		this.started = now;
	}

	destroy(): void {
		this.flush();
		this.setEnabled(false);
		sessions.delete(this);
		owners.delete(this.options.owner);
	}
}

/** G Canvas afterrender also fires on idle frames; rerender marks real drawing. */
export function observeGCanvas(
	canvas: EventTarget,
	layer: string,
	session: PlanarPerformance,
): () => void {
	let started = 0;
	let dirty = false;
	const before = () => {
		started = performance.now();
		dirty = false;
	};
	const rendered = () => {
		dirty = true;
	};
	const after = () => {
		if (!dirty) return;
		session.record(`${layer}Draw`, performance.now() - started);
		if (layer === 'main') session.paint();
	};
	canvas.addEventListener('beforerender', before);
	canvas.addEventListener('rerender', rendered);
	canvas.addEventListener('afterrender', after);
	return () => {
		canvas.removeEventListener('beforerender', before);
		canvas.removeEventListener('rerender', rendered);
		canvas.removeEventListener('afterrender', after);
	};
}
