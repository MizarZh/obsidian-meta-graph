<script lang="ts">
	import type { DefaultLinkStyle } from '../../../core/types';
	import SettingGrid from '../SettingGrid.svelte';
	import TextSetting from '../fields/TextSetting.svelte';
	import ToggleSetting from '../fields/ToggleSetting.svelte';

	export type LinkBehaviorValue = Partial<
		Pick<DefaultLinkStyle, 'label' | 'showLabel' | 'hidden'>
	>;

	let {
		value,
		class: className = '',
		onPatch,
	}: {
		value: LinkBehaviorValue;
		class?: string;
		onPatch: (patch: LinkBehaviorValue) => void;
	} = $props();
</script>

<div class={`knowledge-workspace-link-behavior ${className}`.trim()}>
	{#if value.label !== undefined}
		<TextSetting
			label="Label"
			value={value.label}
			placeholder="Optional label"
			ariaLabel="Link label"
			onInput={(label) => onPatch({ label })}
		/>
	{/if}
	{#if value.showLabel !== undefined}
		<SettingGrid>
			<ToggleSetting
				label="Show label"
				value={value.showLabel}
				ariaLabel="Show link label"
				onChange={(showLabel) => onPatch({ showLabel })}
			/>
			{#if value.hidden !== undefined}
				<ToggleSetting
					label="Hidden"
					value={value.hidden}
					ariaLabel="Hide link"
					onChange={(hidden) => onPatch({ hidden })}
				/>
			{/if}
		</SettingGrid>
	{:else if value.hidden !== undefined}
		<ToggleSetting
			label="Hidden"
			value={value.hidden}
			ariaLabel="Hide link"
			onChange={(hidden) => onPatch({ hidden })}
		/>
	{/if}
</div>
