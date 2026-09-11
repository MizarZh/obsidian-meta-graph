import { supportsPlanarRenderer } from '@/core/types';
import type {
	KnowledgeNode,
	TimelineConfig,
	ViewMode,
	WorkspaceState,
} from '@/core/types';

export function supportsTimeline(mode: ViewMode): boolean {
	return supportsPlanarRenderer(mode) || mode === 'graph-3d' || mode === 'cube';
}

export function normalizeTimeline(value?: unknown): TimelineConfig {
	const v =
		value && typeof value === 'object'
			? (value as Record<string, unknown>)
			: {};
	const time = (n: unknown) =>
		typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 8.64e15
			? n
			: null;
	let start = time(v.start),
		end = time(v.end);
	let current = time(v.current);
	if (start !== null && end !== null && start > end)
		[start, end] = [end, start];
	// Retired metadata sources must not retain a range from an unrelated clock.
	if (
		v.field !== undefined &&
		v.field !== 'created' &&
		v.field !== 'modified'
	) {
		start = null;
		end = null;
		current = null;
	}
	if (current !== null)
		current = Math.max(
			start ?? -Infinity,
			Math.min(end ?? Infinity, current),
		);
	return {
		enabled: v.enabled === true,
		speed:
			typeof v.speed === 'number' &&
			[0.25, 0.5, 1, 2, 4].includes(v.speed)
				? v.speed
				: 1,
		field: v.field === 'modified' ? 'modified' : 'created',
		start,
		end,
		current,
		nodeCount:
			typeof v.nodeCount === 'number' &&
			Number.isSafeInteger(v.nodeCount) &&
			v.nodeCount >= 0 &&
			(v.field === undefined ||
				v.field === 'created' ||
				v.field === 'modified')
				? v.nodeCount
				: null,
		step:
			v.step === 'week' || v.step === 'month' || v.step === 'node'
				? v.step
				: 'day',
	};
}

export function parseTimelineDate(value: unknown): number | undefined {
	if (value instanceof Date)
		return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/u.test(value))
		return undefined;
	const [year, month, day] = value.slice(0, 10).split('-').map(Number);
	const date = new Date(`${value.slice(0, 10)}T00:00:00`);
	if (
		date.getFullYear() !== year ||
		date.getMonth() + 1 !== month ||
		date.getDate() !== day
	)
		return undefined;
	const timestamp = value.length === 10 ? date.getTime() : Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : undefined;
}

export interface TimelineIndex {
	times: ReadonlyMap<string, number>;
	names?: ReadonlyMap<string, string>;
	min: number;
	max: number;
	undated: number;
	undatedIds?: readonly string[];
}
const cache = new WeakMap<
	readonly KnowledgeNode[],
	Map<string, TimelineIndex>
>();

export function indexTimeline(
	nodes: readonly KnowledgeNode[],
	field: string,
): TimelineIndex {
	let fields = cache.get(nodes);
	if (!fields) {
		fields = new Map();
		cache.set(nodes, fields);
	}
	const existing = fields.get(field);
	if (existing) return existing;
	const times = new Map<string, number>();
	const names = new Map<string, string>();
	let min = Infinity,
		max = -Infinity;
	for (const node of nodes) {
		names.set(node.id, node.title || node.fileName || node.id);
		const value =
			field === 'created'
				? node.createdTime
				: field === 'modified'
					? node.modifiedTime
					: undefined;
		if (
			typeof value !== 'number' ||
			!Number.isFinite(value) ||
			Math.abs(value) > 8.64e15
		)
			continue;
		times.set(node.id, value);
		min = Math.min(min, value);
		max = Math.max(max, value);
	}
	const result = {
		times,
		names,
		min: times.size ? min : 0,
		max: times.size ? max : 0,
		undated: nodes.length - times.size,
		undatedIds: nodes
			.filter((node) => !times.has(node.id))
			.map((node) => node.id),
	};
	fields.set(field, result);
	return result;
}

export function timelineRange(
	config: TimelineConfig,
	index: TimelineIndex,
): [number, number] {
	const start = Math.max(
		index.min,
		Math.min(index.max, config.start ?? index.min),
	);
	return [
		start,
		Math.max(start, Math.min(index.max, config.end ?? index.max)),
	];
}

export function timelineCurrent(
	config: TimelineConfig,
	index: TimelineIndex,
): number {
	const [start, end] = timelineRange(config, index);
	return Math.max(start, Math.min(end, config.current ?? end));
}

const timelineNameOrder = new Intl.Collator(undefined, { numeric: true });

/** Exact timestamps first, display names second, IDs only for identical names. */
export function timelineNodeProgress(
	config: TimelineConfig,
	index: TimelineIndex,
	hidden?: ReadonlySet<string>,
): { ids: string[]; count: number; current: number } {
	const [start, end] = timelineRange(config, index);
	const entries = [...index.times]
		.filter(
			([id, time]) => time >= start && time <= end && !hidden?.has(id),
		)
		.sort(
			([a, ta], [b, tb]) =>
				ta - tb ||
				timelineNameOrder.compare(
					index.names?.get(a) ?? a,
					index.names?.get(b) ?? b,
				) ||
				(a < b ? -1 : a > b ? 1 : 0),
		);
	// Missing files have no timestamp: append them after all dated entries.
	const undated = [...(index.undatedIds ?? [])]
		.filter((id) => !hidden?.has(id))
		.sort(
			(a, b) =>
				timelineNameOrder.compare(
					index.names?.get(a) ?? a,
					index.names?.get(b) ?? b,
				) || (a < b ? -1 : a > b ? 1 : 0),
		);
	entries.push(...undated.map((id): [string, number] => [id, end]));
	const cursor = timelineCurrent(config, index);
	const count = Math.min(
		entries.length,
		Math.max(
			0,
			config.nodeCount ??
				entries.filter(([, time]) => time <= cursor).length,
		),
	);
	return {
		ids: entries.map(([id]) => id),
		count,
		current: count ? entries[count - 1]![1] : start,
	};
}

/** Decorate only the view projection; never mutate the canonical query/curated result. */
export function applyTimeline(
	state: WorkspaceState,
	config = state.timeline,
): WorkspaceState {
	if (!config.enabled || !state.projection || !supportsTimeline(state.mode))
		return state;
	const index = indexTimeline(state.projection.nodes, config.field);
	const [start, rangeEnd] = timelineRange(config, index);
	const end = timelineCurrent(config, index);
	const hiddenNodeIds = new Set(state.projection.hiddenNodeIds);
	const nodeProgress =
		config.step === 'node'
			? timelineNodeProgress(
					config,
					index,
					state.projection.hiddenNodeIds,
				)
			: undefined;
	const revealed = nodeProgress
		? new Set(nodeProgress.ids.slice(0, nodeProgress.count))
		: undefined;
	for (const node of state.projection.nodes) {
		const time = index.times.get(node.id);
		if (
			revealed
				? !revealed.has(node.id)
				: time === undefined
					? end < rangeEnd
					: time < start || time > end
		)
			hiddenNodeIds.add(node.id);
	}
	return { ...state, projection: { ...state.projection, hiddenNodeIds } };
}

export function advanceTimeline(
	time: number,
	step: TimelineConfig['step'],
): number {
	const date = new Date(time);
	if (step === 'month') {
		const day = date.getDate();
		date.setDate(1);
		date.setMonth(date.getMonth() + 1);
		const last = new Date(
			date.getFullYear(),
			date.getMonth() + 1,
			0,
		).getDate();
		date.setDate(Math.min(day, last));
	} else date.setDate(date.getDate() + (step === 'week' ? 7 : 1));
	return date.getTime();
}

/** Keep calendar steps, but skip empty intervals instead of appearing frozen. */
export function nextTimelinePlaybackEnd(
	current: number,
	step: TimelineConfig['step'],
	index: TimelineIndex,
	limit = index.max,
): number {
	const end = Math.min(index.max, limit);
	const regular = Math.min(end, advanceTimeline(current, step));
	let nextNode = Infinity;
	for (const time of index.times.values()) {
		if (time > current) nextNode = Math.min(nextNode, time);
	}
	return Number.isFinite(nextNode)
		? Math.min(end, Math.max(regular, nextNode))
		: end;
}

export function timelineConfigKey(config: TimelineConfig): string {
	return JSON.stringify([
		config.enabled,
		config.field,
		config.start,
		config.end,
		config.current,
		config.nodeCount,
		config.step,
		config.speed,
	]);
}
