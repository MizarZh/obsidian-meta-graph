<script lang="ts">
	import { onMount } from 'svelte';
	import type { GraphTraceRequest, NodeBadgeSettings } from '@/core/types';
	import type { GraphRenderer } from '@/graph/renderers/renderer-capabilities';
	import { startContextBadges } from '@/ui/workspace/context-badges';

	let {
		readRenderer,
		ids,
		trace,
		settings,
	}: {
		readRenderer: () => GraphRenderer | undefined;
		ids: ReadonlySet<string>;
		trace?: GraphTraceRequest;
		settings: NodeBadgeSettings;
	} = $props();
	let canvas: HTMLCanvasElement;
	onMount(() =>
		startContextBadges(
			canvas,
			readRenderer,
			() => ids,
			() => trace,
			() => settings,
		),
	);
</script>

<div
	class="knowledge-workspace-canvas knowledge-workspace-context-badges"
	aria-hidden="true"
>
	<canvas bind:this={canvas}></canvas>
</div>
