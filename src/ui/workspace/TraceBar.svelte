<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		DirectionMode,
		GraphProjection,
		GraphTraceRequest,
	} from '@/core/types';
	import type { GraphTraceResult } from '@/query/trace';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '@/ui/obsidian/ObsidianDropdown.svelte';
	import ObsidianSuggestInput from '@/ui/obsidian/ObsidianSuggestInput.svelte';
	import ObsidianSlider from '@/ui/obsidian/ObsidianSlider.svelte';
	import ObsidianToggle from '@/ui/obsidian/ObsidianToggle.svelte';
	let {
		app,
		request,
		projection,
		result,
		picking,
		onPick,
		onChange,
	}: {
		app: App;
		request: GraphTraceRequest;
		projection?: GraphProjection;
		result?: GraphTraceResult;
		picking?: 'source' | 'target';
		onPick: (endpoint: 'source' | 'target') => void;
		onChange: (request: GraphTraceRequest) => void;
	} = $props();

	const title = (id?: string) =>
		projection?.nodes.find((node) => node.id === id)?.title ?? id ?? '';
	const nodes = $derived(
		(projection?.nodes ?? [])
			.filter((node) => !projection?.hiddenNodeIds?.has(node.id))
			.map((node) => ({
				value: node.id,
				label: node.title,
				detail: node.path,
			})),
	);
	const fields = $derived(
		[
			...new Set(
				(projection?.edges ?? [])
					.filter(
						(edge) =>
							edge.kind === undefined || edge.kind === 'relation',
					)
					.map((edge) => edge.sourceField || edge.relation),
			),
		].sort(),
	);
	const rules = $derived(request.fieldRules ?? []);
	const direction = $derived(
		request.direction ??
			(request.mode === 'upstream' ? 'incoming' : 'outgoing'),
	);
	const directionOptions = [
		{ value: 'outgoing', label: 'Follow arrows →' },
		{ value: 'incoming', label: 'Against arrows ←' },
		{ value: 'both', label: 'Both ↔' },
	];
	let sourceText = $state(''),
		targetText = $state('');
	$effect(() => {
		sourceText = title(request.source);
	});
	$effect(() => {
		targetText = title(request.target);
	});
	const patch = (value: Partial<GraphTraceRequest>) =>
		onChange({ ...request, ...value });
	function undirected(field: string): boolean {
		const edges =
			projection?.edges.filter(
				(edge) =>
					(edge.kind === undefined || edge.kind === 'relation') &&
					(edge.sourceField || edge.relation) === field,
			) ?? [];
		return edges.length > 0 && edges.every((edge) => !edge.directed);
	}
</script>

<section class="knowledge-workspace-trace-bar" aria-label="Trace · This view">
	<div
		class="knowledge-workspace-segmented knowledge-workspace-setting-segmented"
	>
		<ObsidianButton
			text="Reachability"
			active={request.mode !== 'path'}
			onClick={() => patch({ mode: 'downstream' })}
		/>
		<ObsidianButton
			text="Between nodes"
			active={request.mode === 'path'}
			onClick={() => patch({ mode: 'path' })}
		/>
	</div>
	<div class="knowledge-workspace-trace-row">
		<span>A · Start</span>
		<ObsidianSuggestInput
			{app}
			value={sourceText}
			options={nodes}
			placeholder="Select a node…"
			ariaLabel="Trace start node"
			showOnEmpty
			allowCustom={false}
			onInput={(value) => {
				sourceText = value;
				if (!value.trim()) patch({ source: '' });
			}}
			onSelect={(option) => patch({ source: option.value })}
		/>
		{#if request.source}
			<ObsidianButton
				icon="x"
				ariaLabel="Clear start node"
				tooltip="Clear start node"
				onClick={() => patch({ source: '' })}
			/>
		{/if}
		<ObsidianButton
			icon="mouse-pointer-2"
			active={picking === 'source'}
			text={picking === 'source' ? 'Cancel picking' : ''}
			cta={picking === 'source'}
			class="knowledge-workspace-trace-pick-button"
			ariaLabel={picking === 'source'
				? 'Cancel picking'
				: 'Pick start in graph'}
			tooltip={picking === 'source'
				? 'Cancel picking'
				: 'Pick start in graph'}
			onClick={() => onPick('source')}
		/>
	</div>
	{#if request.mode === 'path'}
		<div class="knowledge-workspace-trace-swap">
			<ObsidianButton
				icon="arrow-up-down"
				disabled={!request.target}
				ariaLabel="Swap path endpoints"
				tooltip="Swap endpoints"
				onClick={() =>
					request.target &&
					patch({
						source: request.target,
						target: request.source,
					})}
			/>
		</div>
		<div class="knowledge-workspace-trace-row">
			<span>B · End</span>
			<ObsidianSuggestInput
				{app}
				value={targetText}
				options={nodes}
				placeholder="Select a node…"
				ariaLabel="Trace end node"
				showOnEmpty
				allowCustom={false}
				onInput={(value) => {
					targetText = value;
					if (!value.trim()) patch({ target: undefined });
				}}
				onSelect={(option) => patch({ target: option.value })}
			/>
			{#if request.target}
				<ObsidianButton
					icon="x"
					ariaLabel="Clear end node"
					tooltip="Clear end node"
					onClick={() => patch({ target: undefined })}
				/>
			{/if}
			<ObsidianButton
				icon="mouse-pointer-2"
				active={picking === 'target'}
				text={picking === 'target' ? 'Cancel picking' : ''}
				cta={picking === 'target'}
				class="knowledge-workspace-trace-pick-button"
				ariaLabel={picking === 'target'
					? 'Cancel picking'
					: 'Pick end in graph'}
				tooltip={picking === 'target'
					? 'Cancel picking'
					: 'Pick end in graph'}
				onClick={() => onPick('target')}
			/>
		</div>
	{/if}
	<div class="knowledge-workspace-trace-row">
		<span>Relationships</span>
		<ObsidianDropdown
			value={request.allFields === false ? 'selected' : 'all'}
			options={[
				{ value: 'all', label: 'All relationship fields' },
				{ value: 'selected', label: 'Selected fields' },
			]}
			onChange={(value) => patch({ allFields: value === 'all' })}
		/>
	</div>
	{#if request.allFields !== false}
		<div class="knowledge-workspace-trace-row">
			<span>Direction</span><ObsidianDropdown
				value={direction}
				options={directionOptions}
				onChange={(value) =>
					patch({ direction: value as DirectionMode })}
			/>
		</div>
	{:else}
		<div
			class="knowledge-workspace-trace-fields"
			role="group"
			aria-label="Selected relationship fields"
		>
			{#each rules as rule (rule.field)}
				<div class="knowledge-workspace-trace-row">
					<span title={rule.field}>{rule.field}</span>
					<ObsidianDropdown
						ariaLabel={`${rule.field}: Direction`}
						value={undirected(rule.field) ? 'both' : rule.direction}
						disabled={undirected(rule.field)}
						options={directionOptions}
						onChange={(value) =>
							patch({
								fieldRules: rules.map((item) =>
									item.field === rule.field
										? {
												...item,
												direction:
													value as DirectionMode,
											}
										: item,
								),
							})}
					/>
					<ObsidianButton
						icon="x"
						ariaLabel={`Remove ${rule.field}`}
						tooltip={`Remove ${rule.field}`}
						onClick={() =>
							patch({
								fieldRules: rules.filter(
									(item) => item.field !== rule.field,
								),
							})}
					/>
				</div>
			{/each}
			{#key rules.map((rule) => rule.field).join('|')}
				<ObsidianSuggestInput
					{app}
					value=""
					options={fields
						.filter(
							(field) =>
								!rules.some((rule) => rule.field === field),
						)
						.map((field) => ({ value: field, label: field }))}
					placeholder="Add relationship field…"
					ariaLabel="Add trace relationship field"
					showOnEmpty
					allowCustom={false}
					onSelect={(option) =>
						patch({
							fieldRules: [
								...rules,
								{
									field: option.value,
									direction: undirected(option.value)
										? 'both'
										: direction,
								},
							],
						})}
				/>
			{/key}
		</div>
	{/if}
	{#if request.mode !== 'path'}
		<div class="knowledge-workspace-trace-row">
			<span>Layers</span>
			<ObsidianSlider
				value={request.maxDepth ?? 3}
				min={1}
				max={10}
				step={1}
				disabled={request.maxDepth === undefined}
				ariaLabel="Trace layers"
				onChange={(maxDepth) => patch({ maxDepth })}
			/>
			<span>{request.maxDepth ?? 'All'}</span>
			<ObsidianToggle
				value={request.maxDepth === undefined}
				ariaLabel="All layers"
				onChange={(all) => patch({ maxDepth: all ? undefined : 3 })}
			/>
		</div>
	{/if}
	<div role="status">
		{!request.source
			? 'Select a start node or pick one in the graph'
			: picking
				? `Click a node as ${picking === 'source' ? 'start (A)' : 'end (B)'}`
				: request.mode === 'path' && !request.target
					? 'Select an end node or pick one in the graph'
					: request.allFields === false && !rules.length
						? 'Select relationship fields'
						: result?.found
							? `${result.nodeIds.size} nodes · ${result.edgeIds.size} links`
							: 'No path matches these relationships and directions in this view'}
	</div>
</section>
