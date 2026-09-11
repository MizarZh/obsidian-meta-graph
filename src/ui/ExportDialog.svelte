<script lang="ts">
	import { untrack } from 'svelte';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '@/ui/obsidian/ObsidianDropdown.svelte';
	import ObsidianTextInput from '@/ui/obsidian/ObsidianTextInput.svelte';
	import ObsidianToggle from '@/ui/obsidian/ObsidianToggle.svelte';
	import {
		exportDimensions,
		type PngExportOptions,
	} from '@/graph/renderers/renderer-export';
	import {
		isEntryFormat,
		type ChartExportOptions,
		type ExportFormat,
	} from '@/workspace/export/export-options';
	let {
		name,
		planar,
		width,
		height,
		showLegend,
		imageAvailable = true,
		hasSelection = false,
		nodeCount = 0,
		edgeCount = 0,
		onExport,
		onCancel,
	}: {
		name: string;
		planar: boolean;
		width: number;
		height: number;
		showLegend: boolean;
		imageAvailable?: boolean;
		hasSelection?: boolean;
		nodeCount?: number;
		edgeCount?: number;
		onExport: (options: ChartExportOptions) => Promise<string>;
		onCancel: () => void;
	} = $props();
	let filename = $state(untrack(() => name));
	let format = $state<ExportFormat>(
		untrack(() => (imageAvailable ? 'png' : 'json')),
	);
	let entries = $state<ChartExportOptions['entries']>('both');
	let entryScope = $state<ChartExportOptions['entryScope']>('chart');
	let includeMetadata = $state(false);
	const dataExport = $derived(isEntryFormat(format));
	let range = $state<PngExportOptions['range']>('viewport');
	let scale = $state(2);
	let background = $state<PngExportOptions['background']>('theme');
	let legend = $state(untrack(() => showLegend));
	let busy = $state(false);
	let error = $state('');
	let saved = $state('');
	const dimensions = $derived.by(() => {
		if (dataExport)
			return {
				text:
					entryScope === 'selection'
						? 'Selected entries'
						: `${nodeCount} nodes · ${edgeCount} relationships`,
				error: '',
			};
		if (format === 'svg') return { text: 'Scalable vector', error: '' };
		try {
			const size = exportDimensions(width, height, scale);
			return { text: `${size.width} × ${size.height} px`, error: '' };
		} catch (error) {
			return {
				text: '',
				error: error instanceof Error ? error.message : 'Invalid size',
			};
		}
	});
	async function submit() {
		if (busy || dimensions.error) return;
		busy = true;
		error = '';
		saved = '';
		try {
			saved = await onExport({
				filename,
				range,
				scale,
				background,
				legend,
				format,
				entries,
				entryScope,
				includeMetadata: includeMetadata && entries !== 'edges',
			});
		} catch (reason) {
			error = reason instanceof Error ? reason.message : 'Export failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="knowledge-workspace-export-dialog" aria-busy={busy}>
	<div class="setting-item">
		<div class="setting-item-info">Format</div>
		<ObsidianDropdown
			value={format}
			options={[
				...(imageAvailable
					? [{ value: 'png', label: 'PNG image' }]
					: []),
				...(imageAvailable && planar
					? [{ value: 'svg', label: 'SVG vector' }]
					: []),
				{ value: 'json', label: 'JSON entries' },
				{ value: 'csv', label: 'CSV entries' },
				{ value: 'md', label: 'Markdown list' },
			]}
			disabled={busy}
			ariaLabel="Export format"
			onChange={(value) => (format = value as ExportFormat)}
		/>
	</div>
	{#if dataExport}
		<div class="setting-item">
			<div class="setting-item-info">Scope</div>
			<ObsidianDropdown
				value={entryScope}
				options={[
					{ value: 'chart', label: 'Current filtered graph' },
					...(hasSelection
						? [{ value: 'selection', label: 'Current selection' }]
						: []),
				]}
				disabled={busy}
				ariaLabel="Entry scope"
				onChange={(value) => (entryScope = value as typeof entryScope)}
			/>
		</div>
		<div class="setting-item">
			<div class="setting-item-info">Entries</div>
			<ObsidianDropdown
				value={entries}
				options={[
					{ value: 'both', label: 'Nodes and relationships' },
					{ value: 'nodes', label: 'Nodes' },
					{ value: 'edges', label: 'Relationships' },
				]}
				disabled={busy}
				ariaLabel="Export entries"
				onChange={(value) => (entries = value as typeof entries)}
			/>
		</div>
		{#if entries !== 'edges'}<div class="setting-item">
				<div class="setting-item-info">Include metadata</div>
				<ObsidianToggle
					value={includeMetadata}
					disabled={busy}
					ariaLabel="Include note metadata"
					onChange={(value) => (includeMetadata = value)}
				/>
			</div>{/if}
	{:else}
		<div class="setting-item">
			<div class="setting-item-info">Range</div>
			<ObsidianDropdown
				value={range}
				options={planar
					? [
							{ value: 'viewport', label: 'Current view' },
							{ value: 'graph', label: 'Complete graph' },
						]
					: [{ value: 'viewport', label: 'Current view' }]}
				disabled={busy}
				ariaLabel="Export range"
				onChange={(value) => (range = value as typeof range)}
			/>
		</div>
		{#if format === 'png'}<div class="setting-item">
				<div class="setting-item-info">Resolution</div>
				<ObsidianDropdown
					value={String(scale)}
					options={[1, 2, 3].map((value) => ({
						value: String(value),
						label: `${value}×`,
					}))}
					disabled={busy}
					ariaLabel="Export resolution"
					onChange={(value) => (scale = Number(value))}
				/>
			</div>{/if}
		<div class="setting-item">
			<div class="setting-item-info">Background</div>
			<ObsidianDropdown
				value={background}
				options={[
					{ value: 'theme', label: 'Current theme' },
					{ value: 'white', label: 'White' },
					{ value: 'transparent', label: 'Transparent' },
				]}
				disabled={busy}
				ariaLabel="Export background"
				onChange={(value) => (background = value as typeof background)}
			/>
		</div>
		<div class="setting-item">
			<div class="setting-item-info">Legend</div>
			<ObsidianToggle
				value={legend}
				disabled={busy}
				ariaLabel="Include legend"
				onChange={(value) => (legend = value)}
			/>
		</div>
	{/if}
	<div class="setting-item">
		<div class="setting-item-info">File name</div>
		<ObsidianTextInput
			value={filename}
			disabled={busy}
			ariaLabel="Export file name"
			onInput={(value) => (filename = value)}
		/>
	</div>
	<p class="setting-item-description">
		{dimensions.text} · {format.toUpperCase()} · Saved in vault root
	</p>
	{#if dimensions.error || error}<p role="alert">
			{dimensions.error || error}
		</p>{/if}
	{#if saved}<p role="status">Saved: {saved}</p>{/if}
	<div class="knowledge-workspace-export-actions">
		<ObsidianButton text={saved ? 'Close' : 'Cancel'} onClick={onCancel} />
		<ObsidianButton
			text={busy
				? 'Exporting…'
				: `Export ${format === 'md' ? 'Markdown' : format.toUpperCase()}`}
			cta
			disabled={busy || !!dimensions.error || !filename.trim()}
			onClick={() => void submit()}
		/>
	</div>
</div>
