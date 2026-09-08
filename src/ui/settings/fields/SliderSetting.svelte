<script lang="ts">
	import SettingRow from '@/ui/settings/SettingRow.svelte';
	import ObsidianSlider from '@/ui/obsidian/ObsidianSlider.svelte';
	import type {
		NumericSettingFormatter,
		SettingLayout,
	} from '@/ui/settings/types';

	let {
		label,
		description = '',
		tooltip,
		value,
		min,
		max,
		step,
		layout = 'row',
		format = (nextValue) => String(nextValue),
		disabled = false,
		ariaLabel = tooltip ? `${label}. ${tooltip}` : label,
		class: className = '',
		onChange,
		onCommit,
	}: {
		label: string;
		description?: string;
		tooltip?: string;
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

<SettingRow {label} {description} {tooltip} {layout} class={className}>
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
