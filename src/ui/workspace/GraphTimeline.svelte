<script lang="ts">
	import { onMount } from 'svelte';
	import type { KnowledgeNode, TimelineConfig } from '@/core/types';
	import {
		nextTimelinePlaybackEnd,
		timelineConfigKey,
		indexTimeline,
		normalizeTimeline,
		parseTimelineDate,
		timelineRange,
		timelineCurrent,
		timelineNodeProgress,
	} from '@/graph/timeline';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '@/ui/obsidian/ObsidianDropdown.svelte';
	import ObsidianSlider from '@/ui/obsidian/ObsidianSlider.svelte';
	import TextSetting from '@/ui/settings/fields/TextSetting.svelte';
	import ToggleSetting from '@/ui/settings/fields/ToggleSetting.svelte';
	let {
		config,
		nodes,
		baseHiddenNodeIds,
		readOnly = false,
		onPreview,
		onCommit,
	}: {
		config: TimelineConfig;
		nodes: KnowledgeNode[];
		baseHiddenNodeIds?: ReadonlySet<string>;
		readOnly?: boolean;
		onPreview: (value: TimelineConfig) => void;
		onCommit: (value: TimelineConfig) => void;
	} = $props();
	let draft = $state<TimelineConfig>(normalizeTimeline());
	let playing = $state(false);
	let settingsOpen = $state(false);
	let root: HTMLElement;
	let lastConfigKey: string | undefined;
	$effect(() => {
		const key = timelineConfigKey(config);
		if (key === lastConfigKey) return;
		lastConfigKey = key;
		draft = { ...config };
		playing = false;
	});
	const index = $derived(indexTimeline(nodes, draft.field));
	const range = $derived(timelineRange(draft, index));
	const perNode = $derived(draft.step === 'node');
	const nodeProgress = $derived(
		timelineNodeProgress(draft, index, baseHiddenNodeIds),
	);
	const current = $derived(
		perNode ? nodeProgress.current : timelineCurrent(draft, index),
	);
	const playbackEmpty = $derived(
		perNode ? !nodeProgress.ids.length : range[0] >= range[1],
	);
	const fields = [
		{ value: 'created', label: 'Created time' },
		{ value: 'modified', label: 'Modified time' },
	];
	onMount(() => {
		// The main panel rewrites its inline dock offsets; keep this inherited
		// measurement on the stable workspace host instead.
		const main =
			root.closest<HTMLElement>('.knowledge-workspace') ??
			root.parentElement!;
		const owner = root.ownerDocument;
		const outside = (event: PointerEvent) => {
			if (!event.composedPath().includes(root)) settingsOpen = false;
		};
		owner.addEventListener('pointerdown', outside);
		const resize = new ResizeObserver(() =>
			main.style.setProperty(
				'--timeline-height',
				`${root.offsetHeight + 12}px`,
			),
		);
		resize.observe(root);
		return () => {
			owner.removeEventListener('pointerdown', outside);
			resize.disconnect();
			main.style.removeProperty('--timeline-height');
		};
	});
	$effect(() => {
		if (!playing) return;
		const timer = window.setInterval(() => {
			if (perNode) {
				seekNode(nodeProgress.count + 1);
				if (nodeProgress.count >= nodeProgress.ids.length) {
					playing = false;
					save();
				}
				return;
			}
			const next = nextTimelinePlaybackEnd(
				current,
				draft.step,
				index,
				range[1],
			);
			draft = { ...draft, current: next };
			onPreview(draft);
			if (next >= range[1]) {
				playing = false;
				save();
			}
		}, 500);
		return () => window.clearInterval(timer);
	});
	function save(): void {
		if (!readOnly) onCommit({ ...draft });
	}
	function update(patch: Partial<TimelineConfig>, commit = true): void {
		playing = false;
		if ('start' in patch || 'end' in patch || 'field' in patch)
			patch = { ...patch, nodeCount: null };
		draft = normalizeTimeline({ ...draft, ...patch });
		onPreview(draft);
		if (commit) save();
	}
	function play(): void {
		if (playing) {
			playing = false;
			save();
			return;
		}
		if (perNode && nodeProgress.count >= nodeProgress.ids.length) {
			seekNode(0);
		} else if (!perNode && current >= range[1]) {
			draft = { ...draft, current: range[0] };
			onPreview(draft);
		}
		playing = true;
	}
	function seekNode(count: number): void {
		const progress = timelineNodeProgress(
			{ ...draft, nodeCount: Math.max(0, Math.round(count)) },
			index,
			baseHiddenNodeIds,
		);
		draft = {
			...draft,
			nodeCount: progress.count,
			current: progress.current,
		};
		onPreview(draft);
	}
	function scrub(value: number): void {
		playing = false;
		if (perNode) seekNode(value);
		else
			update(
				{ current: Math.max(range[0], Math.min(range[1], value)) },
				false,
			);
	}
	function dateInput(time: number): string {
		const date = new Date(time);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}
	function progressDate(time: number): string {
		if (!perNode) return dateInput(time);
		const clock = new Date(time).toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23',
		});
		return `${dateInput(time)} ${clock}`;
	}
	function setDate(value: string, end: boolean): void {
		let time = parseTimelineDate(value);
		if (time === undefined) return;
		if (end) {
			const date = new Date(time);
			date.setDate(date.getDate() + 1);
			time = date.getTime() - 1;
		}
		update(
			end
				? { end: Math.max(range[0], time) }
				: { start: Math.min(range[1], time) },
		);
	}
</script>

<aside
	class="knowledge-workspace-timeline"
	aria-label="Timeline"
	bind:this={root}
>
	<div class="knowledge-workspace-timeline-toolbar">
		<ObsidianButton
			icon={playing ? 'pause' : 'play'}
			ariaLabel={playing ? 'Pause timeline' : 'Play timeline'}
			tooltip="Cumulative playback, not historical snapshots"
			disabled={readOnly || index.times.size === 0 || playbackEmpty}
			onClick={play}
		/>
		<ObsidianDropdown
			value={draft.field}
			options={fields}
			ariaLabel="Timeline date field"
			disabled={readOnly}
			onChange={(field) =>
				update({
					field: field === 'modified' ? 'modified' : 'created',
					start: null,
					end: null,
					current: null,
				})}
		/>
		<ObsidianDropdown
			value={draft.step}
			options={[
				{ value: 'day', label: 'Day' },
				{ value: 'week', label: 'Week' },
				{ value: 'month', label: 'Month' },
				{ value: 'node', label: 'Per node' },
			]}
			ariaLabel="Playback step"
			disabled={readOnly}
			onChange={(step) =>
				update({
					step: step as TimelineConfig['step'],
					nodeCount: null,
					current,
				})}
		/>
		<ObsidianButton
			icon="rotate-ccw"
			ariaLabel="Reset timeline range"
			tooltip="Reset to full range"
			disabled={readOnly}
			onClick={() => update({ start: null, end: null, current: null })}
		/>
		<ObsidianButton
			icon="settings-2"
			ariaLabel="Timeline settings"
			tooltip="Timeline settings"
			active={settingsOpen}
			onClick={() => (settingsOpen = !settingsOpen)}
		/>
		{#if index.times.size}
			<div class="knowledge-workspace-timeline-range">
				<TextSetting
					label="From"
					type="date"
					value={dateInput(range[0])}
					min={dateInput(index.min)}
					max={dateInput(range[1])}
					disabled={readOnly}
					onChange={(value) => setDate(value, false)}
				/>
				<TextSetting
					label="To"
					type="date"
					value={dateInput(range[1])}
					min={dateInput(range[0])}
					max={dateInput(index.max)}
					disabled={readOnly}
					onChange={(value) => setDate(value, true)}
				/>
			</div>
		{/if}
	</div>
	{#if index.times.size}
		<div
			class="knowledge-workspace-timeline-progress"
			title="Current date within the fixed From/To range"
		>
			<span>Progress</span>
			<ObsidianSlider
				value={perNode ? nodeProgress.count : current}
				min={perNode ? 0 : range[0]}
				max={perNode ? nodeProgress.ids.length : range[1]}
				step={perNode ? 1 : 'any'}
				ariaLabel={perNode
					? 'Timeline revealed node count'
					: 'Timeline current date'}
				disabled={readOnly || playbackEmpty}
				onChange={scrub}
				onCommit={() => save()}
			/>
			<time
				datetime={new Date(current).toISOString()}
				title={new Date(current).toLocaleString()}
				>{perNode
					? `${nodeProgress.count} / ${nodeProgress.ids.length} · `
					: ''}{progressDate(current)}</time
			>
		</div>
	{:else}
		<p>No valid dates in this field.</p>
	{/if}
	{#if settingsOpen}
		<section
			class="knowledge-workspace-timeline-settings"
			aria-label="Timeline settings"
		>
			<header>
				<strong>Timeline settings</strong><ObsidianButton
					icon="x"
					ariaLabel="Close timeline settings"
					tooltip="Close timeline settings"
					onClick={() => (settingsOpen = false)}
				/>
			</header>
			<ToggleSetting
				label="Include undated nodes"
				value={draft.includeUndated}
				disabled={readOnly}
				onChange={(includeUndated) => update({ includeUndated })}
			/>
			<small
				>{index.undated} undated nodes. Playback shows current notes, not
				past versions.</small
			>
		</section>
	{/if}
</aside>
