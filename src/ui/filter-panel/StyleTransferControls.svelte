<script lang="ts">
	import type { ChartStyleConfig } from '../../core/types';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import {
		copyChartStyles,
		pasteChartStyles,
	} from '../filter/style-transfer';

	let {
		style,
		onPaste,
	}: {
		style: ChartStyleConfig;
		onPaste: (style: ChartStyleConfig) => void;
	} = $props();

	let status = $state('');

	async function copyStyles(): Promise<void> {
		await copyChartStyles(style);
		status = 'Copied';
	}

	async function pasteStyles(): Promise<void> {
		const nextStyle = await pasteChartStyles();
		if (!nextStyle) {
			status = 'Nothing to paste';
			return;
		}
		onPaste(nextStyle);
		status = 'Pasted';
	}
</script>

<div class="knowledge-workspace-style-transfer" aria-live="polite">
	<ObsidianButton
		icon="copy"
		text="Copy chart styles"
		onClick={() => void copyStyles()}
	/>
	<ObsidianButton
		icon="clipboard-paste"
		text="Paste chart styles"
		onClick={() => void pasteStyles()}
	/>
	{#if status}
		<span class="knowledge-workspace-style-transfer-status">{status}</span>
	{/if}
</div>
