<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		ChartGroupingConfig,
		KnowledgeNode,
		ManualLayoutConfig,
		ViewMode,
	} from '../core/types';
	import { resolveChartGroupOwnership } from '../query/group-ownership';
	import InternalNotePreview from './workspace/InternalNotePreview.svelte';
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
		grouping = { groups: [], overrides: {} },
		activeConnectionField = '',
		contentVisible = false,
		onOpenNote = () => {},
		onOpenMetadataLink = () => {},
		onSetNodeGroup = () => {},
		onConnectNode = () => {},
		onContentVisibleChange = () => {},
	}: {
		app: App;
		node?: KnowledgeNode;
		nodes?: KnowledgeNode[];
		nodeColor?: string;
		mode?: ViewMode;
		manualLayout?: ManualLayoutConfig;
		grouping?: ChartGroupingConfig;
		activeConnectionField?: string;
		contentVisible?: boolean;
		onOpenNote?: (path: string) => void;
		onOpenMetadataLink?: (linkText: string, sourcePath: string) => void;
		onSetNodeGroup?: (path: string, groupId?: string | null) => void;
		onConnectNode?: (
			sourcePath: string,
			targetPath: string,
			field: string,
		) => void;
		onContentVisibleChange?: (visible: boolean) => void;
	} = $props();

	type MetadataSegment =
		| { kind: 'text'; text: string }
		| { kind: 'link'; text: string; linkText: string };

	const wikiLinkPattern = /\[\[([^\]]+)\]\]/gu;
	const AUTOMATIC_GROUP = '__automatic__';
	const UNGROUPED_GROUP = '__ungrouped__';

	let linkTargetPath = $state('');

	const canAssignGroup = $derived(
		mode === 'graph' ||
			mode === 'free' ||
			mode === 'cube' ||
			mode === 'flow' ||
			mode === 'arc' ||
			mode === 'hierarchical-edge-bundling',
	);
	const groupRequired = $derived(mode === 'cube');
	const assignmentGroups = $derived(
		groupRequired ? manualLayout.groups : grouping.groups,
	);
	const automaticOwner = $derived.by(() => {
		if (!node || groupRequired) {
			return undefined;
		}
		return resolveChartGroupOwnership([node], grouping).byNode.get(node.id)
			?.groupId;
	});
	const groupOptions = $derived.by(() => {
		const options = assignmentGroups.map((group) => ({
			value: group.id,
			label: group.name,
		}));
		return groupRequired
			? options
			: [
					{
						value: AUTOMATIC_GROUP,
						label: automaticOwner
							? `Automatic (${assignmentGroups.find((group) => group.id === automaticOwner)?.name ?? automaticOwner})`
							: 'Automatic',
					},
					{ value: UNGROUPED_GROUP, label: 'Ungrouped' },
					...options,
				];
	});
	const selectedGroupId = $derived.by(() => {
		if (!node) {
			return AUTOMATIC_GROUP;
		}
		if (groupRequired) {
			return manualLayout.nodes[node.path]?.groupId ?? '';
		}
		if (
			!Object.prototype.hasOwnProperty.call(grouping.overrides, node.path)
		) {
			return AUTOMATIC_GROUP;
		}
		return grouping.overrides[node.path] ?? UNGROUPED_GROUP;
	});
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
			<div class="knowledge-workspace-inspector-header-actions">
				<ObsidianButton
					class="knowledge-workspace-inspector-content-toggle"
					icon={contentVisible ? 'fold-vertical' : 'unfold-vertical'}
					active={contentVisible}
					ariaLabel={`${contentVisible ? 'Fold' : 'Unfold'} ${node.title} content`}
					tooltip={contentVisible ? 'Fold content' : 'Unfold content'}
					onClick={() => onContentVisibleChange(!contentVisible)}
				/>
				<ObsidianButton
					class="knowledge-workspace-inspector-open"
					icon="file-text"
					ariaLabel={`Open ${node.title}`}
					tooltip="Open"
					onClick={() => onOpenNote(node.path)}
				/>
			</div>
		</div>
		<div class="knowledge-workspace-inspector-body">
			<span class="knowledge-workspace-inspector-summary"
				>{node.path}</span
			>
			{#if node.noteType}
				<span class="knowledge-workspace-inspector-summary"
					>Type: {node.noteType}</span
				>
			{/if}
			{#if node.domains.length}
				<span class="knowledge-workspace-inspector-summary"
					>Domains: {node.domains.join(', ')}</span
				>
			{/if}
			{#if canAssignGroup && assignmentGroups.length > 0}
				<hr />
				<label class="knowledge-workspace-inspector-control">
					<span>Group</span>
					<ObsidianDropdown
						value={selectedGroupValue}
						options={groupOptions}
						ariaLabel="Node group"
						onChange={(groupId) =>
							onSetNodeGroup(
								node.path,
								groupId === AUTOMATIC_GROUP
									? undefined
									: groupId === UNGROUPED_GROUP
										? null
										: groupId,
							)}
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
			{#if contentVisible}
				<hr />
				<InternalNotePreview
					{app}
					filePath={node.path}
					onOpenInternalLink={onOpenMetadataLink}
				/>
			{/if}
		</div>
	</section>
{/if}
