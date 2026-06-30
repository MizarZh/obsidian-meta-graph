<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		ChartGroup,
		KnowledgeNode,
		ManualLayoutConfig,
		ViewMode,
	} from '../core/types';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import ObsidianSuggestInput, {
		type SuggestionOption,
	} from './obsidian/ObsidianSuggestInput.svelte';

	let {
		app,
		node,
		nodes = [],
		nodeColor,
		mode = 'graph',
		manualLayout = { nodes: {}, groups: [] },
		activeConnectionField = '',
		onOpenNote = () => {},
		onOpenMetadataLink = () => {},
		onSetNodeGroup = () => {},
		onConnectNode = () => {},
	}: {
		app: App;
		node?: KnowledgeNode;
		nodes?: KnowledgeNode[];
		nodeColor?: string;
		mode?: ViewMode;
		manualLayout?: ManualLayoutConfig;
		activeConnectionField?: string;
		onOpenNote?: (path: string) => void;
		onOpenMetadataLink?: (linkText: string, sourcePath: string) => void;
		onSetNodeGroup?: (path: string, groupId?: string) => void;
		onConnectNode?: (
			sourcePath: string,
			targetPath: string,
			field: string,
		) => void;
	} = $props();

	type MetadataSegment =
		| { kind: 'text'; text: string }
		| { kind: 'link'; text: string; linkText: string };

	const wikiLinkPattern = /\[\[([^\]]+)\]\]/gu;

	let linkTargetPath = $state('');

	const canAssignGroup = $derived(mode === 'free' || mode === 'cube');
	const groupRequired = $derived(mode === 'cube');
	const groupOptions = $derived.by(() => {
		const options = manualLayout.groups.map((group: ChartGroup) => ({
			value: group.id,
			label: group.name,
		}));
		return groupRequired
			? options
			: [{ value: '', label: 'No group' }, ...options];
	});
	const selectedGroupId = $derived(
		node ? (manualLayout.nodes[node.path]?.groupId ?? '') : '',
	);
	const selectedGroupValue = $derived(
		groupRequired && !selectedGroupId && groupOptions[0]
			? groupOptions[0].value
			: selectedGroupId,
	);
	const noteOptions = $derived<SuggestionOption[]>(
		nodes
			.filter((candidate) => candidate.path !== node?.path)
			.map((candidate) => ({
				value: candidate.path,
				label: candidate.title,
				detail: candidate.path,
				searchText: `${candidate.title} ${candidate.path}`,
			})),
	);

	function renderMetadataValue(value: unknown): MetadataSegment[] {
		if (Array.isArray(value)) {
			return value.flatMap((item, index) => [
				...(index > 0 ? [{ kind: 'text' as const, text: ', ' }] : []),
				...renderMetadataValue(item),
			]);
		}
		if (typeof value === 'string') {
			return renderMetadataString(value);
		}
		return [{ kind: 'text', text: String(value) }];
	}

	function renderMetadataString(value: string): MetadataSegment[] {
		const segments: MetadataSegment[] = [];
		let lastIndex = 0;
		for (const match of value.matchAll(wikiLinkPattern)) {
			const index = match.index ?? 0;
			const rawContent = match[1] ?? '';
			if (index > lastIndex) {
				segments.push({
					kind: 'text',
					text: value.slice(lastIndex, index),
				});
			}
			segments.push({
				kind: 'link',
				text: readLinkLabel(rawContent),
				linkText: readLinkTarget(rawContent),
			});
			lastIndex = index + match[0].length;
		}
		if (lastIndex < value.length) {
			segments.push({ kind: 'text', text: value.slice(lastIndex) });
		}
		if (segments.length > 0) {
			return segments;
		}
		return isKnownMetadataLink(value)
			? [{ kind: 'link', text: value, linkText: value }]
			: [{ kind: 'text', text: value }];
	}

	function isKnownMetadataLink(value: string): boolean {
		const target = readLinkTarget(value);
		return Boolean(target && node?.links?.includes(target));
	}

	function readLinkTarget(value: string): string {
		return (value.split('|')[0] ?? '').split('#')[0]?.trim() ?? '';
	}

	function readLinkLabel(value: string): string {
		return (value.split('|')[1] ?? value).trim();
	}

	function addLink(): void {
		if (!node || !linkTargetPath || !activeConnectionField) {
			return;
		}
		onConnectNode(node.path, linkTargetPath, activeConnectionField);
		linkTargetPath = '';
	}
</script>

{#if node}
	<section
		class="knowledge-workspace-inspector"
		style:--knowledge-workspace-node-color={nodeColor}
	>
		<div class="knowledge-workspace-inspector-header">
			<strong>{node.title}</strong>
			<ObsidianButton
				class="knowledge-workspace-inspector-open"
				icon="file-text"
				ariaLabel={`Open ${node.title}`}
				tooltip="Open note"
				onClick={() => onOpenNote(node.path)}
			/>
		</div>
		<span>{node.path}</span>
		{#if node.noteType}<span>Type: {node.noteType}</span>{/if}
		{#if node.domains.length}<span>Domains: {node.domains.join(', ')}</span
			>{/if}
		{#if canAssignGroup && groupOptions.length > 0}
			<hr />
			<label class="knowledge-workspace-inspector-control">
				<span>Group</span>
				<ObsidianDropdown
					value={selectedGroupValue}
					options={groupOptions}
					ariaLabel="Node group"
					onChange={(groupId) =>
						onSetNodeGroup(node.path, groupId || undefined)}
				/>
			</label>
		{/if}
		{#if noteOptions.length > 0 && activeConnectionField}
			<hr />
			<div class="knowledge-workspace-inspector-link">
				<ObsidianSuggestInput
					{app}
					type="search"
					placeholder="Add link"
					ariaLabel="Link target"
					value={linkTargetPath}
					options={noteOptions}
					showOnEmpty={true}
					onInput={(value) => (linkTargetPath = value)}
					onSelect={(option) => (linkTargetPath = option.value)}
				/>
				<span>{activeConnectionField}</span>
				<ObsidianButton
					icon="link"
					ariaLabel="Add link"
					tooltip="Add link"
					disabled={!linkTargetPath}
					onClick={addLink}
				/>
			</div>
		{/if}
		{#if node.metadata && Object.keys(node.metadata).length > 0}
			<hr />
			{#each Object.entries(node.metadata) as [key, value]}
				<div class="knowledge-workspace-inspector-metadata">
					<strong>{key}</strong>
					<span>
						{#each renderMetadataValue(value) as segment}
							{#if segment.kind === 'link'}
								<button
									type="button"
									class="knowledge-workspace-inspector-metadata-link"
									title={segment.linkText}
									onclick={() =>
										onOpenMetadataLink(
											segment.linkText,
											node.path,
										)}
								>
									{segment.text}
								</button>
							{:else}
								{segment.text}
							{/if}
						{/each}
					</span>
				</div>
			{/each}
		{/if}
	</section>
{/if}
