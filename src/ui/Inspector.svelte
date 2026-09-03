<script lang="ts">
	import { setIcon, type App, type IconName } from 'obsidian';
	import type {
		ChartGroupingConfig,
		ConnectionFieldMode,
		KnowledgeNode,
		ManualLayoutConfig,
		ViewMode,
	} from '../core/types';
	import { normalizeTags } from '../core/tags';
	import { resolveChartGroupOwnership } from '../query/group-ownership';
	import { resolveGroupCapabilities } from '../workspace/groups/group-policy';
	import {
		getConnectionDirectionIcon,
		getConnectionDirectionLabel,
	} from './connection-direction';
	import InternalNotePreview from './workspace/InternalNotePreview.svelte';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import { obsidianTooltip } from './obsidian/obsidian-tooltip';
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
		activeConnectionMode = 'directed',
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
		activeConnectionMode?: ConnectionFieldMode;
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
		| { kind: 'link'; text: string; linkText: string }
		| { kind: 'tag'; text: string };

	const wikiLinkPattern = /\[\[([^\]]+)\]\]/gu;
	const AUTOMATIC_GROUP = '__automatic__';
	const UNGROUPED_GROUP = '__ungrouped__';

	let linkTargetPath = $state('');

	function obsidianIcon(node: HTMLElement, icon: IconName) {
		setIcon(node, icon);
		return {
			update(nextIcon: IconName) {
				setIcon(node, nextIcon);
			},
		};
	}

	const canAssignGroup = $derived(
		resolveGroupCapabilities(mode).canAssignManually,
	);
	const groupRequired = $derived(mode === 'cube');
	const assignmentGroups = $derived(grouping.groups);
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
			return grouping.overrides[node.path] ?? '';
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

	function renderMetadataValue(
		key: string,
		value: unknown,
	): MetadataSegment[] {
		if (key.toLocaleLowerCase() === 'tags') {
			const values = Array.isArray(value) ? value : [value];
			return normalizeTags(
				values.filter(
					(item): item is string => typeof item === 'string',
				),
			).map((tag) => ({ kind: 'tag', text: `#${tag}` }));
		}
		if (Array.isArray(value)) {
			return value.flatMap((item, index) => [
				...(index > 0 ? [{ kind: 'text' as const, text: ', ' }] : []),
				...renderMetadataValue(key, item),
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
			<strong use:obsidianTooltip={node.title}>{node.title}</strong>
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
			<span
				class="knowledge-workspace-inspector-summary"
				use:obsidianTooltip={node.path}>{node.path}</span
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
					<span
						class="knowledge-workspace-inspector-link-field"
						use:obsidianTooltip={`${activeConnectionField}: ${getConnectionDirectionLabel(activeConnectionMode)}`}
					>
						<span
							class="knowledge-workspace-connection-direction-icon"
							use:obsidianIcon={getConnectionDirectionIcon(
								activeConnectionMode,
							)}
							aria-hidden="true"
						></span>
						<span>{activeConnectionField}</span>
					</span>
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
							{#each renderMetadataValue(key, value) as segment}
								{#if segment.kind === 'link'}
									<button
										type="button"
										class="knowledge-workspace-inspector-metadata-link"
										use:obsidianTooltip={segment.linkText}
										onclick={() =>
											onOpenMetadataLink(
												segment.linkText,
												node.path,
											)}
									>
										{segment.text}
									</button>
								{:else if segment.kind === 'tag'}
									<a
										class="tag knowledge-workspace-inspector-metadata-tag"
										href={segment.text}
										target="_blank"
										rel="noopener nofollow"
										>{segment.text}</a
									>
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
