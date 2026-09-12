<script lang="ts">
	import { onMount } from 'svelte';
	import type { GraphRenderer } from '@/graph/renderers/renderer-capabilities';
	import { startContextBadges } from '@/ui/workspace/context-badges';

	let {
		readRenderer,
		ids,
	}: {
		readRenderer: () => GraphRenderer | undefined;
		ids: ReadonlySet<string>;
	} = $props();
	let canvas: HTMLCanvasElement;
	onMount(() => startContextBadges(canvas, readRenderer, () => ids));
</script>

<div
	class="knowledge-workspace-canvas knowledge-workspace-context-badges"
	aria-hidden="true"
>
	<canvas bind:this={canvas}></canvas>
</div>
