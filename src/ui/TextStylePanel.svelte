<script lang="ts">
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianSlider from './obsidian/ObsidianSlider.svelte';
	import type { LabelPosition, ViewMode } from '../core/types';

	const LABEL_POSITION_OPTIONS: Array<{
		value: LabelPosition;
		label: string;
	}> = [
		{ value: 'right', label: 'Right' },
		{ value: 'left', label: 'Left' },
		{ value: 'top', label: 'Top' },
		{ value: 'bottom', label: 'Bottom' },
	];

	let {
		mode,
		labelSize,
		labelPosition,
		labelColor,
		labelBackgroundOpacity,
		onLabelSize,
		onLabelPosition,
		onLabelColor,
		onLabelBackgroundOpacity,
		scheduleColorCommit,
		commitColor,
		getDefaultLabelColor,
	}: {
		mode: ViewMode;
		labelSize: number;
		labelPosition: LabelPosition;
		labelColor: string;
		labelBackgroundOpacity: number;
		onLabelSize: (value: number) => void;
		onLabelPosition: (position: LabelPosition) => void;
		onLabelColor: (color: string) => void;
		onLabelBackgroundOpacity: (value: number) => void;
		scheduleColorCommit: (
			key: string,
			currentColor: string,
			nextColor: string,
			commit: (color: string) => void,
		) => void;
		commitColor: (
			key: string,
			currentColor: string,
			nextColor: string,
			commit: (color: string) => void,
		) => void;
		getDefaultLabelColor: () => string;
	} = $props();
</script>

<section>
	<header><h3>Text style</h3></header>
	<label class="knowledge-workspace-rule-label">
		<span>Font size</span>
		<div class="knowledge-workspace-slider-value">
			<ObsidianSlider
				value={labelSize}
				min={8}
				max={28}
				step={0.5}
				format={(value) => value.toFixed(1)}
				onChange={onLabelSize}
				onCommit={onLabelSize}
			/>
			<span>{labelSize.toFixed(1)}</span>
		</div>
	</label>
	<label class="knowledge-workspace-rule-label">
		<span>Font color</span>
		<input
			type="color"
			value={labelColor || getDefaultLabelColor()}
			oninput={(event) =>
				scheduleColorCommit(
					'text:label-color',
					labelColor || getDefaultLabelColor(),
					event.currentTarget.value,
					onLabelColor,
				)}
			onchange={(event) =>
				commitColor(
					'text:label-color',
					labelColor || getDefaultLabelColor(),
					event.currentTarget.value,
					onLabelColor,
				)}
		/>
	</label>
	{#if mode !== 'hierarchical-edge-bundling'}
		<div class="knowledge-workspace-rule-label segmented">
			<span>Text position</span>
			<div class="knowledge-workspace-segmented">
				{#each LABEL_POSITION_OPTIONS as option}
					<ObsidianButton
						active={labelPosition === option.value}
						text={option.label}
						onClick={() => onLabelPosition(option.value)}
					/>
				{/each}
			</div>
		</div>
	{/if}
	<label class="knowledge-workspace-rule-label">
		<span>Text background</span>
		<div class="knowledge-workspace-slider-value">
			<ObsidianSlider
				value={labelBackgroundOpacity}
				min={0}
				max={1}
				step={0.05}
				format={(value) => `${Math.round(value * 100)}%`}
				onChange={onLabelBackgroundOpacity}
				onCommit={onLabelBackgroundOpacity}
			/>
			<span>{Math.round(labelBackgroundOpacity * 100)}%</span>
		</div>
	</label>
</section>
