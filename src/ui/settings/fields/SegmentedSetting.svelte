<script lang="ts" generics="T extends string | number">
	import SettingRow from '@/ui/settings/SettingRow.svelte';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import type { SettingOption } from '@/ui/settings/types';

	let {
		label,
		description = '',
		value,
		options,
		disabled = false,
		class: className = '',
		rowClass = '',
		onChange,
	}: {
		label: string;
		description?: string;
		value: T;
		options: readonly SettingOption<T>[];
		disabled?: boolean;
		class?: string;
		rowClass?: string;
		onChange: (value: T) => void;
	} = $props();
</script>

<SettingRow {label} {description} layout="segmented" class={rowClass}>
	<div
		class={`knowledge-workspace-segmented knowledge-workspace-setting-segmented ${className}`.trim()}
	>
		{#each options as option}
			<ObsidianButton
				active={value === option.value}
				text={option.icon ? '' : option.label}
				icon={option.icon}
				ariaLabel={option.ariaLabel ?? option.label}
				tooltip={option.tooltip}
				class={option.class}
				{disabled}
				onClick={() => onChange(option.value)}
			/>
		{/each}
	</div>
</SettingRow>
