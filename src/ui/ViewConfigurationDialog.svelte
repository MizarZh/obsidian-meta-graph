<script lang="ts">
	import type { WorkspaceState } from '@/core/types';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import ObsidianTextInput from '@/ui/obsidian/ObsidianTextInput.svelte';
	import DropdownSetting from '@/ui/settings/fields/DropdownSetting.svelte';
	import ToggleSetting from '@/ui/settings/fields/ToggleSetting.svelte';
	import SegmentedSetting from '@/ui/settings/fields/SegmentedSetting.svelte';
	import { getChartTypeName } from '@/core/chart-types';
	import {
		CONFIGURATION_PARTS,
		DEFAULT_CONFIGURATION_SELECTION,
		captureViewConfiguration,
		configurationAvailable,
		parseViewConfiguration,
		type ConfigurationPart,
		type ConfigurationSelection,
		type ViewConfiguration,
	} from '@/workspace/configuration/view-configuration';
	let {
		workspaceState,
		onApply,
		onExport,
		onClose,
	}: {
		workspaceState: WorkspaceState;
		onApply: (
			config: ViewConfiguration,
			selection: ConfigurationSelection,
		) => void;
		onExport: (
			config: ViewConfiguration,
			filename: string,
		) => Promise<string>;
		onClose: () => void;
	} = $props();
	const target = $derived(
		workspaceState.charts.find(
			(chart) => chart.id === workspaceState.activeChartId,
		)!,
	);
	const otherCharts = $derived(
		workspaceState.charts.filter(
			(chart) => chart.id !== workspaceState.activeChartId,
		),
	);
	let mode = $state<'apply' | 'export'>('apply');
	let sourceId = $state('');
	let imported = $state<ViewConfiguration>();
	let selection = $state<ConfigurationSelection>({
		...DEFAULT_CONFIGURATION_SELECTION,
	});
	let error = $state('');
	let saved = $state('');
	let busy = $state(false);
	let filename = $state('');
	let input = $state<HTMLInputElement>();
	const sourceOptions = $derived([
		...otherCharts.map((chart) => ({
			value: chart.id,
			label: `${chart.name} · ${getChartTypeName(chart.type)}`,
		})),
		...(imported
			? [{ value: '__import__', label: `${imported.name} · Imported` }]
			: []),
	]);
	const selectedSource = $derived(sourceId || otherCharts[0]?.id || '');
	const source = $derived.by(() => {
		if (mode === 'export')
			return captureViewConfiguration(
				target,
				{ styles: true, layout: true, panels: true, groups: true },
				workspaceState,
			);
		if (selectedSource === '__import__') return imported;
		const chart = otherCharts.find((chart) => chart.id === selectedSource);
		return chart
			? captureViewConfiguration(chart, {
					styles: true,
					layout: true,
					panels: true,
					groups: true,
				})
			: undefined;
	});
	const effectiveSelection = $derived(
		Object.fromEntries(
			CONFIGURATION_PARTS.map((part) => [
				part,
				!!source &&
					selection[part] &&
					configurationAvailable(source, target, part),
			]),
		) as ConfigurationSelection,
	);
	const anySelected = $derived(
		CONFIGURATION_PARTS.some((part) => effectiveSelection[part]),
	);
	const LABELS: Record<ConfigurationPart, string> = {
		styles: 'Styles',
		layout: 'Layout',
		panels: 'Panels',
		groups: 'Groups (add)',
	};
	const DESCRIPTIONS: Record<ConfigurationPart, string> = {
		styles: 'Node and link appearance, style rules, labels, and badges.',
		layout: 'Spacing, direction, forces, and routing. Same view type only; node positions stay unchanged.',
		panels: 'Panel visibility, placement, tabs, widths, and Timeline visibility.',
		groups: 'Add group definitions and rules; keep existing groups. Manual note assignments are not copied.',
	};
	function unavailableReason(part: ConfigurationPart): string | undefined {
		if (!source) return 'Choose a source view or import a configuration.';
		if (source[part] === undefined)
			return 'Not included in this configuration.';
		if (part === 'layout' && source.sourceType !== target.type)
			return `Requires ${getChartTypeName(source.sourceType)}.`;
		if (part === 'groups' && !configurationAvailable(source, target, part))
			return 'Groups cannot be transferred to or from this view type.';
		return undefined;
	}
	async function importFile(event: Event) {
		const el = event.currentTarget as HTMLInputElement;
		const file = el.files?.[0];
		if (!file) return;
		error = '';
		saved = '';
		try {
			if (file.size > 2_000_000)
				throw new Error('Configuration file is too large.');
			imported = parseViewConfiguration(await file.text());
			sourceId = '__import__';
		} catch (e) {
			error =
				e instanceof Error ? e.message : 'Cannot read configuration.';
		} finally {
			el.value = '';
		}
	}
	async function submit() {
		if (!source || !anySelected || busy) return;
		error = '';
		saved = '';
		busy = true;
		try {
			if (mode === 'apply') {
				onApply(source, effectiveSelection);
				onClose();
			} else {
				const config = { ...source };
				for (const part of CONFIGURATION_PARTS)
					if (!effectiveSelection[part]) delete config[part];
				saved = await onExport(
					config,
					filename.trim() || `${target.name} configuration`,
				);
			}
		} catch (e) {
			error =
				e instanceof Error
					? e.message
					: 'Could not transfer configuration.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="knowledge-workspace-configuration-dialog">
	<SegmentedSetting
		label="Action"
		value={mode}
		options={[
			{ value: 'apply', label: 'Apply' },
			{ value: 'export', label: 'Export' },
		]}
		onChange={(value) => {
			mode = value;
			error = '';
			saved = '';
		}}
	/>
	{#if mode === 'apply'}
		<DropdownSetting
			label="From"
			cssSized
			value={selectedSource}
			options={sourceOptions.length
				? sourceOptions
				: [{ value: '', label: 'No other views' }]}
			disabled={!sourceOptions.length}
			onChange={(value) => {
				sourceId = value;
				error = '';
			}}
		/>
		<input
			type="file"
			accept=".json,application/json"
			hidden
			bind:this={input}
			onchange={(event) => void importFile(event)}
		/>
		<ObsidianButton
			text="Import configuration…"
			onClick={() => input?.click()}
		/>
		<p>Apply to <strong>{target.name}</strong></p>
	{:else}
		<p>Export <strong>{target.name}</strong></p>
		<label class="knowledge-workspace-configuration-filename"
			><span>Filename</span><ObsidianTextInput
				value={filename}
				placeholder={`${target.name} configuration`}
				onInput={(value) => (filename = value)}
			/></label
		>
	{/if}
	<div class="knowledge-workspace-configuration-parts">
		{#each CONFIGURATION_PARTS as part}
			<div title={unavailableReason(part)}>
				<ToggleSetting
					label={LABELS[part]}
					description={DESCRIPTIONS[part]}
					value={effectiveSelection[part]}
					disabled={!source ||
						!configurationAvailable(source, target, part) ||
						busy}
					onChange={(value) =>
						(selection = { ...selection, [part]: value })}
				/>
				{#if source && part === 'layout' && source.layout && source.sourceType !== target.type}<small
						>{unavailableReason(part)}</small
					>{/if}
			</div>
		{/each}
	</div>
	<p>
		{mode === 'apply'
			? 'Selected settings replace the target settings. Groups are added; Query and note assignments stay with this view.'
			: 'Saved as a JSON file in the vault root. Query and note assignments are excluded.'}
	</p>
	{#if error}<p role="alert">{error}</p>{/if}
	{#if saved}<p role="status">Saved: {saved}</p>{/if}
	<div class="knowledge-workspace-configuration-actions">
		<ObsidianButton text="Close" onClick={onClose} />
		<ObsidianButton
			text={busy
				? 'Working…'
				: mode === 'apply'
					? 'Apply'
					: 'Export configuration'}
			cta
			disabled={!anySelected || busy}
			onClick={() => void submit()}
		/>
	</div>
</div>
