<script lang="ts">
	import SettingsSection from '../settings/SettingsSection.svelte';
	import SettingGrid from '../settings/SettingGrid.svelte';
	import ColorSetting from '../settings/fields/ColorSetting.svelte';
	import DropdownSetting from '../settings/fields/DropdownSetting.svelte';
	import SegmentedSetting from '../settings/fields/SegmentedSetting.svelte';
	import SliderSetting from '../settings/fields/SliderSetting.svelte';
	import ToggleSetting from '../settings/fields/ToggleSetting.svelte';
	import type {
		ArcLabelAngle,
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
	const ARC_LABEL_ANGLE_OPTIONS: Array<{
		value: ArcLabelAngle;
		label: string;
	}> = [
		{ value: 'auto', label: 'Auto' },
		{ value: 0, label: '0°' },
		{ value: 45, label: '45°' },
		{ value: 90, label: '90°' },
	];

	let {
		mode,
		labelSize,
		scaleLabelsWithZoom,
		forceLabels,
		arcLabelAngle,
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
		onScaleLabelsWithZoom,
		onForceLabels,
		onArcLabelAngle,
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
		scaleLabelsWithZoom: boolean;
		forceLabels: boolean;
		arcLabelAngle: ArcLabelAngle;
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
		onScaleLabelsWithZoom: (value: boolean) => void;
		onForceLabels: (value: boolean) => void;
		onArcLabelAngle: (value: ArcLabelAngle) => void;
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
	<header><h3>Label settings</h3></header>
	<SliderSetting
		label="Font size"
		value={labelSize}
		min={8}
		max={28}
		step={0.5}
		format={(value) => value.toFixed(1)}
		onChange={onLabelSize}
		onCommit={onLabelSize}
	/>
	{#if mode !== 'graph-3d' && mode !== 'cube'}
		<ToggleSetting
			label="Scale text with zoom"
			value={scaleLabelsWithZoom}
			onChange={onScaleLabelsWithZoom}
		/>
	{/if}
	{#if mode === 'graph-3d' || mode === 'cube'}
		<DropdownSetting
			label="3D text clarity"
			value={threeLabelResolution}
			options={THREE_LABEL_RESOLUTION_OPTIONS}
			onChange={(value) =>
				onThreeLabelResolution(value as ThreeLabelResolution)}
		/>
	{/if}
	<ToggleSetting
		label="Always show labels"
		description={mode === 'graph-3d'
			? '3D graph always renders every visible label.'
			: ''}
		value={mode === 'graph-3d' ? true : forceLabels}
		disabled={mode === 'graph-3d'}
		onChange={onForceLabels}
	/>
	<SettingGrid>
		<ToggleSetting label="Bold" value={labelBold} onChange={onLabelBold} />
		<ToggleSetting
			label="Italic"
			value={labelItalic}
			onChange={onLabelItalic}
		/>
	</SettingGrid>
	{#if mode !== 'hierarchical-edge-bundling'}
		<SegmentedSetting
			label="Text position"
			value={labelPosition}
			options={LABEL_POSITION_OPTIONS}
			onChange={onLabelPosition}
		/>
		<SliderSetting
			label="Text offset"
			value={labelOffset}
			min={0}
			max={2.5}
			step={0.1}
			format={(value) => value.toFixed(1)}
			onChange={onLabelOffset}
			onCommit={onLabelOffset}
		/>
	{/if}
	{#if mode === 'arc'}
		<SegmentedSetting
			label="Label angle"
			value={arcLabelAngle}
			options={ARC_LABEL_ANGLE_OPTIONS}
			onChange={(value) => onArcLabelAngle(value as ArcLabelAngle)}
		/>
	{/if}
	{#if usesThemeProfiles}
		<SettingsSection title="Light profile" bind:open={lightProfileOpen}>
			<SettingGrid density="compact">
				<ColorSetting
					label="Text"
					layout="stacked"
					value={labelLightTextColor}
					commitKey="text:light-text"
					ariaLabel="Light profile text color"
					onChange={onLabelLightTextColor}
				/>
				<ColorSetting
					label="Background"
					layout="stacked"
					value={labelLightBackgroundColor}
					commitKey="text:light-background"
					ariaLabel="Light profile background color"
					onChange={onLabelLightBackgroundColor}
				/>
			</SettingGrid>
			<SliderSetting
				label="Background opacity"
				value={labelLightBackgroundOpacity}
				min={0}
				max={1}
				step={0.05}
				format={(value) => `${Math.round(value * 100)}%`}
				onChange={onLabelLightBackgroundOpacity}
				onCommit={onLabelLightBackgroundOpacity}
			/>
		</SettingsSection>
		<SettingsSection title="Dark profile" bind:open={darkProfileOpen}>
			<SettingGrid density="compact">
				<ColorSetting
					label="Text"
					layout="stacked"
					value={labelDarkTextColor}
					commitKey="text:dark-text"
					ariaLabel="Dark profile text color"
					onChange={onLabelDarkTextColor}
				/>
				<ColorSetting
					label="Background"
					layout="stacked"
					value={labelDarkBackgroundColor}
					commitKey="text:dark-background"
					ariaLabel="Dark profile background color"
					onChange={onLabelDarkBackgroundColor}
				/>
			</SettingGrid>
			<SliderSetting
				label="Background opacity"
				value={labelDarkBackgroundOpacity}
				min={0}
				max={1}
				step={0.05}
				format={(value) => `${Math.round(value * 100)}%`}
				onChange={onLabelDarkBackgroundOpacity}
				onCommit={onLabelDarkBackgroundOpacity}
			/>
		</SettingsSection>
	{:else}
		<ColorSetting
			label="Font color"
			value={labelColor || getDefaultLabelColor()}
			commitKey="text:label-color"
			ariaLabel="Font color"
			onChange={onLabelColor}
		/>
		<SliderSetting
			label="Text background"
			value={labelBackgroundOpacity}
			min={0}
			max={1}
			step={0.05}
			format={(value) => `${Math.round(value * 100)}%`}
			onChange={onLabelBackgroundOpacity}
			onCommit={onLabelBackgroundOpacity}
		/>
	{/if}
</section>
