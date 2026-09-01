<script lang="ts">
	import SettingRow from '../SettingRow.svelte';
	import ObsidianDropdown, {
		type DropdownOption,
	} from '../../obsidian/ObsidianDropdown.svelte';
	import type { SettingLayout } from '../types';

	let {
		label,
		description = '',
		value,
		layout = 'row',
		options,
		disabled = false,
		ariaLabel = label,
		class: className = '',
		onChange,
	}: {
		label: string;
		description?: string;
		value: string;
		layout?: SettingLayout;
		options: DropdownOption[];
		disabled?: boolean;
		ariaLabel?: string;
		class?: string;
		onChange: (value: string) => void;
	} = $props();
</script>

<SettingRow {label} {description} {layout} class={className}>
	<ObsidianDropdown {value} {options} {disabled} {ariaLabel} {onChange} />
</SettingRow>
