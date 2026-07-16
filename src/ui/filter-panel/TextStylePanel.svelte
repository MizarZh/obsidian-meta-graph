<script lang="ts">
	import CollapsibleSettingsGroup from './CollapsibleSettingsGroup.svelte';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianColorInput from '../obsidian/ObsidianColorInput.svelte';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import ObsidianSlider from '../obsidian/ObsidianSlider.svelte';
	import ObsidianToggle from '../obsidian/ObsidianToggle.svelte';
	import type {
		LabelPosition,
		ThreeLabelResolution,
		ViewMode,
	} from '../../core/types';

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
	const THREE_LABEL_RESOLUTION_OPTIONS = [
		{ value: 'standard', label: 'Standard' },
		{ value: 'high', label: 'High' },
		{ value: 'ultra', label: 'Ultra' },
	] satisfies Array<{ value: ThreeLabelResolution; label: string }>;

	let {
		mode,
		labelSize,
		threeLabelResolution,
		labelBold,
		labelItalic,
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
		onThreeLabelResolution,
		onLabelBold,
		onLabelItalic,
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
		getDefaultLabelColor,
	}: {
		mode: ViewMode;
		labelSize: number;
		threeLabelResolution: ThreeLabelResolution;
		labelBold: boolean;
		labelItalic: boolean;
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
		onThreeLabelResolution: (value: ThreeLabelResolution) => void;
		onLabelBold: (value: boolean) => void;
		onLabelItalic: (value: boolean) => void;
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
	{#if mode === 'graph-3d' || mode === 'cube'}
		<label class="knowledge-workspace-rule-label">
			<span>3D text clarity</span>
			<ObsidianDropdown
				value={threeLabelResolution}
				options={THREE_LABEL_RESOLUTION_OPTIONS}
				ariaLabel="3D text clarity"
				onChange={(value) =>
					onThreeLabelResolution(value as ThreeLabelResolution)}
			/>
		</label>
	{/if}
	<div class="knowledge-workspace-text-style-pair">
		<label class="knowledge-workspace-rule-label">
			<span>Bold</span>
			<ObsidianToggle value={labelBold} onChange={onLabelBold} />
		</label>
		<label class="knowledge-workspace-rule-label">
			<span>Italic</span>
			<ObsidianToggle value={labelItalic} onChange={onLabelItalic} />
		</label>
	</div>
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
			<div class="knowledge-workspace-text-style-pair profile-colors">
				<label class="knowledge-workspace-rule-label">
					<span>Text</span>
					<ObsidianColorInput
						value={labelLightTextColor}
						commitKey="text:light-text"
						ariaLabel="Light profile text color"
						onChange={onLabelLightTextColor}
					/>
				</label>
				<label class="knowledge-workspace-rule-label">
					<span>Background</span>
					<ObsidianColorInput
						value={labelLightBackgroundColor}
						commitKey="text:light-background"
						ariaLabel="Light profile background color"
						onChange={onLabelLightBackgroundColor}
					/>
				</label>
			</div>
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
			<div class="knowledge-workspace-text-style-pair profile-colors">
				<label class="knowledge-workspace-rule-label">
					<span>Text</span>
					<ObsidianColorInput
						value={labelDarkTextColor}
						commitKey="text:dark-text"
						ariaLabel="Dark profile text color"
						onChange={onLabelDarkTextColor}
					/>
				</label>
				<label class="knowledge-workspace-rule-label">
					<span>Background</span>
					<ObsidianColorInput
						value={labelDarkBackgroundColor}
						commitKey="text:dark-background"
						ariaLabel="Dark profile background color"
						onChange={onLabelDarkBackgroundColor}
					/>
				</label>
			</div>
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
			<ObsidianColorInput
				value={labelColor || getDefaultLabelColor()}
				commitKey="text:label-color"
				ariaLabel="Font color"
				onChange={onLabelColor}
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
