<script lang="ts">
	import SettingRow from '@/ui/settings/SettingRow.svelte';
	import ObsidianDropdown, {
		type DropdownOption,
	} from '@/ui/obsidian/ObsidianDropdown.svelte';
	import type { SettingLayout } from '@/ui/settings/types';

	let {
		label,
		description = '',
		value,
		layout = 'row',
		options,
		disabled = false,
		cssSized = false,
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
		cssSized?: boolean;
		ariaLabel?: string;
		class?: string;
		onChange: (value: string) => void;
	} = $props();
</script>

<SettingRow {label} {description} {layout} class={className}>
	<ObsidianDropdown
		{value}
		{options}
		{disabled}
		{cssSized}
		{ariaLabel}
		{onChange}
	/>
</SettingRow>
