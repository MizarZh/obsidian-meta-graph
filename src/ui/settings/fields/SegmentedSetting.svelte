<script lang="ts" generics="T extends string | number">
	import SettingRow from '../SettingRow.svelte';
	import ObsidianButton from '../../obsidian/ObsidianButton.svelte';
	import type { SettingOption } from '../types';

	let {
		label,
		description = '',
		value,
		options,
		disabled = false,
		class: className = '',
		onChange,
	}: {
		label: string;
		description?: string;
		value: T;
		options: readonly SettingOption<T>[];
		disabled?: boolean;
		class?: string;
		onChange: (value: T) => void;
	} = $props();
</script>

<SettingRow {label} {description} layout="segmented">
	<div
		class={`knowledge-workspace-segmented knowledge-workspace-setting-segmented ${className}`.trim()}
	>
		{#each options as option}
			<ObsidianButton
				active={value === option.value}
				text={option.label}
				{disabled}
				onClick={() => onChange(option.value)}
			/>
		{/each}
	</div>
</SettingRow>
