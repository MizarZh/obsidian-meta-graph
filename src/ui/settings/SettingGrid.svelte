<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SettingGridDensity } from './types';

	let {
		columns = 2,
		density = 'comfortable',
		class: className = '',
		children,
	}: {
		columns?: number;
		density?: SettingGridDensity;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div
	class={`knowledge-workspace-setting-grid knowledge-workspace-setting-grid--${density} ${className}`.trim()}
	style={`--knowledge-workspace-setting-columns: ${Math.max(1, Math.round(columns))};`}
>
	{@render children()}
</div>
