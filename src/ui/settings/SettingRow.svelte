<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SettingLayout } from '@/ui/settings/types';

	let {
		label,
		description = '',
		tooltip,
		layout = 'row',
		class: className = '',
		children,
	}: {
		label: string;
		description?: string;
		tooltip?: string;
		layout?: SettingLayout;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div
	title={tooltip}
	class={`knowledge-workspace-setting-row knowledge-workspace-setting-row--${layout} ${className}`.trim()}
>
	<div class="knowledge-workspace-setting-label">
		<span>{label}</span>
		{#if description}
			<small>{description}</small>
		{/if}
	</div>
	<div class="knowledge-workspace-setting-control">
		{@render children()}
	</div>
</div>
