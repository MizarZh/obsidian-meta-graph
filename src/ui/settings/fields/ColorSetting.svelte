<script lang="ts">
	import SettingRow from '../SettingRow.svelte';
	import ObsidianColorInput from '../../obsidian/ObsidianColorInput.svelte';
	import type { SettingLayout } from '../types';

	let {
		label,
		description = '',
		value,
		layout = 'row',
		commitKey,
		disabled = false,
		ariaLabel = label,
		class: className = '',
		onChange,
	}: {
		label: string;
		description?: string;
		value: string;
		layout?: SettingLayout;
		commitKey: string;
		disabled?: boolean;
		ariaLabel?: string;
		class?: string;
		onChange: (value: string) => void;
	} = $props();
</script>

<SettingRow {label} {description} {layout} class={className}>
	<ObsidianColorInput {value} {commitKey} {disabled} {ariaLabel} {onChange} />
</SettingRow>
