<script lang="ts">
	import CollapsibleSettingsGroup from './CollapsibleSettingsGroup.svelte';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianSlider from '../obsidian/ObsidianSlider.svelte';
	import type { LabelPosition, ViewMode } from '../../core/types';

	const LABEL_POSITION_OPTIONS: Array<{
		value: LabelPosition;
		label: string;
	}> = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'right', label: 'Right' },
		{ value: 'left', label: 'Left' },
		{ value: 'top', label: 'Top' },
		{ value: 'bottom', label: 'Bottom' },
		{ value: 'center', label: 'Center' },
	];

	let {
		mode,
		labelSize,
		labelPosition,
		labelOffset,
		labelColor,
		labelLightTextColor,
		labelLightBackgroundColor,
		labelLightBackgroundOpacity,
		labelDarkTextColor,
		labelDarkBackgroundColor,
		labelDarkBackgroundOpacity,
		labelBackgroundOpacity,
		onLabelSize,
		onLabelPosition,
		onLabelOffset,
		onLabelColor,
		onLabelLightTextColor,
		onLabelLightBackgroundColor,
		onLabelLightBackgroundOpacity,
		onLabelDarkTextColor,
		onLabelDarkBackgroundColor,
		onLabelDarkBackgroundOpacity,
		onLabelBackgroundOpacity,
		scheduleColorCommit,
		commitColor,
		getDefaultLabelColor,
	}: {
		mode: ViewMode;
		labelSize: number;
		labelPosition: LabelPosition;
		labelOffset: number;
		labelColor: string;
		labelLightTextColor: string;
		labelLightBackgroundColor: string;
		labelLightBackgroundOpacity: number;
		labelDarkTextColor: string;
		labelDarkBackgroundColor: string;
		labelDarkBackgroundOpacity: number;
		labelBackgroundOpacity: number;
		onLabelSize: (value: number) => void;
		onLabelPosition: (position: LabelPosition) => void;
		onLabelOffset: (value: number) => void;
		onLabelColor: (color: string) => void;
		onLabelLightTextColor: (color: string) => void;
		onLabelLightBackgroundColor: (color: string) => void;
		onLabelLightBackgroundOpacity: (value: number) => void;
		onLabelDarkTextColor: (color: string) => void;
		onLabelDarkBackgroundColor: (color: string) => void;
		onLabelDarkBackgroundOpacity: (value: number) => void;
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

	const usesThemeProfiles = true;
	let lightProfileOpen = $state(true);
	let darkProfileOpen = $state(true);
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
		<label class="knowledge-workspace-rule-label">
			<span>Text offset</span>
			<div class="knowledge-workspace-slider-value">
				<ObsidianSlider
					value={labelOffset}
					min={0}
					max={2.5}
					step={0.1}
					format={(value) => value.toFixed(1)}
					onChange={onLabelOffset}
					onCommit={onLabelOffset}
				/>
				<span>{labelOffset.toFixed(1)}</span>
			</div>
		</label>
	{/if}
	{#if usesThemeProfiles}
		<CollapsibleSettingsGroup
			title="Light profile"
			bind:open={lightProfileOpen}
		>
			<label class="knowledge-workspace-rule-label">
				<span>Text</span>
				<input
					type="color"
					value={labelLightTextColor}
					oninput={(event) =>
						scheduleColorCommit(
							'text:light-text',
							labelLightTextColor,
							event.currentTarget.value,
							onLabelLightTextColor,
						)}
					onchange={(event) =>
						commitColor(
							'text:light-text',
							labelLightTextColor,
							event.currentTarget.value,
							onLabelLightTextColor,
						)}
				/>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Background</span>
				<input
					type="color"
					value={labelLightBackgroundColor}
					oninput={(event) =>
						scheduleColorCommit(
							'text:light-background',
							labelLightBackgroundColor,
							event.currentTarget.value,
							onLabelLightBackgroundColor,
						)}
					onchange={(event) =>
						commitColor(
							'text:light-background',
							labelLightBackgroundColor,
							event.currentTarget.value,
							onLabelLightBackgroundColor,
						)}
				/>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Background opacity</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						value={labelLightBackgroundOpacity}
						min={0}
						max={1}
						step={0.05}
						format={(value) => `${Math.round(value * 100)}%`}
						onChange={onLabelLightBackgroundOpacity}
						onCommit={onLabelLightBackgroundOpacity}
					/>
					<span>{Math.round(labelLightBackgroundOpacity * 100)}%</span
					>
				</div>
			</label>
		</CollapsibleSettingsGroup>
		<CollapsibleSettingsGroup
			title="Dark profile"
			bind:open={darkProfileOpen}
		>
			<label class="knowledge-workspace-rule-label">
				<span>Text</span>
				<input
					type="color"
					value={labelDarkTextColor}
					oninput={(event) =>
						scheduleColorCommit(
							'text:dark-text',
							labelDarkTextColor,
							event.currentTarget.value,
							onLabelDarkTextColor,
						)}
					onchange={(event) =>
						commitColor(
							'text:dark-text',
							labelDarkTextColor,
							event.currentTarget.value,
							onLabelDarkTextColor,
						)}
				/>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Background</span>
				<input
					type="color"
					value={labelDarkBackgroundColor}
					oninput={(event) =>
						scheduleColorCommit(
							'text:dark-background',
							labelDarkBackgroundColor,
							event.currentTarget.value,
							onLabelDarkBackgroundColor,
						)}
					onchange={(event) =>
						commitColor(
							'text:dark-background',
							labelDarkBackgroundColor,
							event.currentTarget.value,
							onLabelDarkBackgroundColor,
						)}
				/>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Background opacity</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						value={labelDarkBackgroundOpacity}
						min={0}
						max={1}
						step={0.05}
						format={(value) => `${Math.round(value * 100)}%`}
						onChange={onLabelDarkBackgroundOpacity}
						onCommit={onLabelDarkBackgroundOpacity}
					/>
					<span>{Math.round(labelDarkBackgroundOpacity * 100)}%</span>
				</div>
			</label>
		</CollapsibleSettingsGroup>
	{:else}
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
	{/if}
</section>
