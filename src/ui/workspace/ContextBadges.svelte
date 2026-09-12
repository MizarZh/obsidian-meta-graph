<script lang="ts">
	import { onMount } from 'svelte';
	import type { GraphTraceRequest } from '@/core/types';
	import type { GraphRenderer } from '@/graph/renderers/renderer-capabilities';
	import { startContextBadges } from '@/ui/workspace/context-badges';

	let {
		readRenderer,
		ids,
		trace,
	}: {
		readRenderer: () => GraphRenderer | undefined;
		ids: ReadonlySet<string>;
		trace?: GraphTraceRequest;
	} = $props();
	let canvas: HTMLCanvasElement;
	onMount(() =>
		startContextBadges(
			canvas,
			readRenderer,
			() => ids,
			() => trace,
		),
	);
</script>

<div
	class="knowledge-workspace-canvas knowledge-workspace-context-badges"
	aria-hidden="true"
>
	<canvas bind:this={canvas}></canvas>
</div>
