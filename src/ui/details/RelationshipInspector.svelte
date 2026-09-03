<script lang="ts">
	import type { KnowledgeEdge, KnowledgeNode } from '../../core/types';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import { obsidianTooltip } from '../obsidian/obsidian-tooltip';
	import { getOtherLinksBetweenNotes } from './relationship-details';

	let {
		edge,
		edges,
		visibleEdgeIds,
		nodes,
		onOpenNote,
		onFocusNode,
		onSelectEdge,
	}: {
		edge: KnowledgeEdge;
		edges: KnowledgeEdge[];
		visibleEdgeIds: ReadonlySet<string>;
		nodes: KnowledgeNode[];
		onOpenNote: (nodeId: string) => void;
		onFocusNode: (nodeId: string) => void;
		onSelectEdge: (edgeId: string) => void;
	} = $props();

	const nodesById = $derived(new Map(nodes.map((node) => [node.id, node])));
	const pairEdges = $derived(
		getOtherLinksBetweenNotes(edge, edges, visibleEdgeIds),
	);
	const sourceTitle = $derived(readNodeTitle(edge.source));
	const targetTitle = $derived(readNodeTitle(edge.target));
	const relationshipTitle = $derived(
		`${sourceTitle} ${edge.directed ? '→' : '—'} ${targetTitle}`,
	);
	const storedTargetPath = $derived(readStoredTargetPath(edge));
	const storedValue = $derived(readStoredValue(edge));

	function readNodeTitle(nodeId: string): string {
		return nodesById.get(nodeId)?.title ?? nodeId.replace(/\.md$/iu, '');
	}

	function readStoredTargetPath(candidate: KnowledgeEdge): string {
		return candidate.sourcePath === candidate.source
			? candidate.target
			: candidate.source;
	}

	function readStoredValue(candidate: KnowledgeEdge): string {
		const storedNode = nodesById.get(candidate.sourcePath);
		const value = storedNode?.metadata?.[candidate.sourceField];
		const target = readStoredTargetPath(candidate).replace(/\.md$/iu, '');
		const values = Array.isArray(value) ? value : [value];
		const match = values.find(
			(item) => typeof item === 'string' && item.includes(target),
		);
		return typeof match === 'string' ? match : `[[${target}]]`;
	}

	function direction(candidate: KnowledgeEdge): string {
		const source = readNodeTitle(candidate.source);
		const target = readNodeTitle(candidate.target);
		return candidate.directed
			? `${source} → ${target}`
			: `${source} — ${target}`;
	}

	function kindLabel(candidate: KnowledgeEdge): string {
		if (candidate.kind === 'plain-link') return 'Plain link';
		if (candidate.kind === 'unresolved-link') return 'Unresolved';
		return 'Metadata';
	}
</script>

<section
	class="knowledge-workspace-inspector knowledge-workspace-relationship-inspector"
>
	<header class="knowledge-workspace-inspector-header">
		<div class="knowledge-workspace-detail-title">
			<strong use:obsidianTooltip={relationshipTitle}
				>{relationshipTitle}</strong
			>
			<span>{pairEdges.length + 1} links between these notes</span>
		</div>
		<div class="knowledge-workspace-inspector-header-actions">
			<ObsidianButton
				icon="file-input"
				ariaLabel={`Open ${sourceTitle}`}
				tooltip={`Open ${sourceTitle}`}
				onClick={() => onOpenNote(edge.source)}
			/>
			<ObsidianButton
				icon="file-output"
				ariaLabel={`Open ${targetTitle}`}
				tooltip={`Open ${targetTitle}`}
				onClick={() => onOpenNote(edge.target)}
			/>
		</div>
	</header>
	<div class="knowledge-workspace-inspector-body">
		<section
			class="knowledge-workspace-detail-section knowledge-workspace-current-relationship"
		>
			<header>
				<h4>Current relationship</h4>
				<span class="knowledge-workspace-detail-badge">Current</span>
			</header>
			<div class="knowledge-workspace-relationship-hero">
				<span use:obsidianTooltip={sourceTitle}>{sourceTitle}</span>
				<strong
					>{edge.directed
						? `—${edge.relation}→`
						: `—${edge.relation}—`}</strong
				>
				<span use:obsidianTooltip={targetTitle}>{targetTitle}</span>
			</div>
			<dl class="knowledge-workspace-detail-grid">
				<dt>Property</dt>
				<dd use:obsidianTooltip={edge.sourceField}>
					{edge.sourceField}
				</dd>
				<dt>Stored in</dt>
				<dd use:obsidianTooltip={edge.sourcePath}>{edge.sourcePath}</dd>
				<dt>Stored value</dt>
				<dd use:obsidianTooltip={storedValue}>{storedValue}</dd>
				<dt>Linked note</dt>
				<dd use:obsidianTooltip={storedTargetPath}>
					{storedTargetPath}
				</dd>
				<dt>Graph direction</dt>
				<dd use:obsidianTooltip={direction(edge)}>{direction(edge)}</dd>
				<dt>Type</dt>
				<dd>{kindLabel(edge)}</dd>
			</dl>
			<div class="knowledge-workspace-detail-actions">
				<ObsidianButton
					icon="crosshair"
					text="Focus source"
					onClick={() => onFocusNode(edge.source)}
				/>
				<ObsidianButton
					icon="crosshair"
					text="Focus target"
					onClick={() => onFocusNode(edge.target)}
				/>
			</div>
		</section>

		<section class="knowledge-workspace-detail-section">
			<header>
				<h4>Other links between these notes</h4>
				<span>{pairEdges.length}</span>
			</header>
			{#if pairEdges.length === 0}
				<p class="knowledge-workspace-detail-empty">
					No other links between these notes.
				</p>
			{:else}
				<div class="knowledge-workspace-related-link-list">
					{#each pairEdges as candidate (candidate.id)}
						<button
							type="button"
							class="knowledge-workspace-related-link"
							class:hidden-link={!visibleEdgeIds.has(
								candidate.id,
							)}
							disabled={!visibleEdgeIds.has(candidate.id)}
							onclick={() => onSelectEdge(candidate.id)}
						>
							<span
								class="knowledge-workspace-related-link-direction"
								use:obsidianTooltip={direction(candidate)}
							>
								{direction(candidate)}
							</span>
							<strong use:obsidianTooltip={candidate.sourceField}
								>{candidate.sourceField}</strong
							>
							{#if !visibleEdgeIds.has(candidate.id)}
								<span
									class="knowledge-workspace-detail-badge muted"
								>
									Hidden by current filters
								</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</section>
