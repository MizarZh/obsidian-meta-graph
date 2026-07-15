<script lang="ts">
	import { Component, MarkdownRenderer, TFile, type App } from 'obsidian';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';

	let {
		app,
		filePath,
		onClose,
		onOpen,
	}: {
		app: App;
		filePath: string;
		onClose: () => void;
		onOpen: (filePath: string) => void;
	} = $props();

	let contentEl: HTMLDivElement;
	let errorMessage = $state('');
	const title = $derived(
		filePath.split('/').pop()?.replace(/\.md$/u, '') ?? filePath,
	);

	$effect(() => {
		const target = contentEl;
		const path = filePath;
		if (!target || !path) {
			return;
		}
		let disposed = false;
		const renderComponent = new Component();
		renderComponent.load();
		target.replaceChildren();
		errorMessage = '';

		void (async () => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				errorMessage = 'Note not found.';
				return;
			}
			try {
				const markdown = await app.vault.cachedRead(file);
				if (disposed) {
					return;
				}
				await MarkdownRenderer.render(
					app,
					markdown,
					target,
					file.path,
					renderComponent,
				);
			} catch (error) {
				if (!disposed) {
					errorMessage =
						error instanceof Error
							? error.message
							: 'Unable to render note.';
				}
			}
		})();

		return () => {
			disposed = true;
			renderComponent.unload();
			target.replaceChildren();
		};
	});
</script>

<section class="knowledge-workspace-internal-preview">
	<header>
		<strong title={filePath}>{title}</strong>
		<div>
			<ObsidianButton
				icon="file-text"
				ariaLabel="Open note"
				tooltip="Open note"
				onClick={() => onOpen(filePath)}
			/>
			<ObsidianButton
				icon="x"
				ariaLabel="Close preview"
				tooltip="Close preview"
				onClick={onClose}
			/>
		</div>
	</header>
	{#if errorMessage}
		<div class="knowledge-workspace-internal-preview-error">
			{errorMessage}
		</div>
	{/if}
	<div
		class="knowledge-workspace-internal-preview-content markdown-preview-view markdown-rendered"
		bind:this={contentEl}
	></div>
</section>
