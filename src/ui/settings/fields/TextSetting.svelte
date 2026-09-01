<script lang="ts">
	import SettingRow from '../SettingRow.svelte';
	import ObsidianTextInput from '../../obsidian/ObsidianTextInput.svelte';
	import type { SettingLayout } from '../types';

	let {
		label,
		description = '',
		value,
		layout = 'row',
		type = 'text',
		placeholder = '',
		min,
		max,
		step,
		list,
		disabled = false,
		ariaLabel = label,
		class: className = '',
		onChange,
		onInput,
		onBlur,
		onFocus,
		onKeydown,
	}: {
		label: string;
		description?: string;
		value: string | number;
		layout?: SettingLayout;
		type?: string;
		placeholder?: string;
		min?: string;
		max?: string;
		step?: string;
		list?: string;
		disabled?: boolean;
		ariaLabel?: string;
		class?: string;
		onChange?: (value: string) => void;
		onInput?: (value: string) => void;
		onBlur?: (event: FocusEvent) => void;
		onFocus?: (event: FocusEvent) => void;
		onKeydown?: (event: KeyboardEvent) => void;
	} = $props();
</script>

<SettingRow {label} {description} {layout} class={className}>
	<ObsidianTextInput
		{value}
		{type}
		{placeholder}
		{min}
		{max}
		{step}
		{list}
		{disabled}
		{ariaLabel}
		{onChange}
		{onInput}
		{onBlur}
		{onFocus}
		{onKeydown}
	/>
</SettingRow>
