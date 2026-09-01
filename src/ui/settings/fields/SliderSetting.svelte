<script lang="ts">
	import SettingRow from '../SettingRow.svelte';
	import ObsidianSlider from '../../obsidian/ObsidianSlider.svelte';
	import type { NumericSettingFormatter, SettingLayout } from '../types';

	let {
		label,
		description = '',
		value,
		min,
		max,
		step,
		layout = 'row',
		format = (nextValue) => String(nextValue),
		disabled = false,
		ariaLabel = label,
		class: className = '',
		onChange,
		onCommit,
	}: {
		label: string;
		description?: string;
		value: number;
		min: number | null;
		max: number | null;
		step: number | 'any';
		layout?: SettingLayout;
		format?: NumericSettingFormatter;
		disabled?: boolean;
		ariaLabel?: string;
		class?: string;
		onChange: (value: number) => void;
		onCommit?: (value: number) => void;
	} = $props();
</script>

<SettingRow {label} {description} {layout} class={className}>
	<div class="knowledge-workspace-slider-value">
		<ObsidianSlider
			{value}
			{min}
			{max}
			{step}
			{disabled}
			{ariaLabel}
			{onChange}
			{onCommit}
		/>
		<span>{format(value)}</span>
	</div>
</SettingRow>
