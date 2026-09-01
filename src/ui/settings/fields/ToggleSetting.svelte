<script lang="ts">
	import SettingRow from '../SettingRow.svelte';
	import ObsidianToggle from '../../obsidian/ObsidianToggle.svelte';
	import type { SettingLayout } from '../types';

	let {
		label,
		description = '',
		value,
		layout = 'row',
		disabled = false,
		ariaLabel = label,
		class: className = '',
		onChange,
	}: {
		label: string;
		description?: string;
		value: boolean;
		layout?: SettingLayout;
		disabled?: boolean;
		ariaLabel?: string;
		class?: string;
		onChange: (value: boolean) => void;
	} = $props();
</script>

<SettingRow {label} {description} {layout} class={className}>
	<ObsidianToggle {value} {disabled} {ariaLabel} {onChange} />
</SettingRow>
