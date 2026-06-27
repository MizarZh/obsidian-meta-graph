<script lang="ts">
	import type { KnowledgeNode } from "../core/types";
	import ObsidianButton from "./obsidian/ObsidianButton.svelte";

	let {
		node,
		nodeColor,
		onOpenNote = () => {},
		onOpenMetadataLink = () => {},
	}: {
		node?: KnowledgeNode;
		nodeColor?: string;
		onOpenNote?: (path: string) => void;
		onOpenMetadataLink?: (linkText: string, sourcePath: string) => void;
	} = $props();

	type MetadataSegment =
		| { kind: "text"; text: string }
		| { kind: "link"; text: string; linkText: string };

	const wikiLinkPattern = /\[\[([^\]]+)\]\]/gu;

	function renderMetadataValue(value: unknown): MetadataSegment[] {
		if (Array.isArray(value)) {
			return value.flatMap((item, index) => [
				...(index > 0 ? [{ kind: "text" as const, text: ", " }] : []),
				...renderMetadataValue(item),
			]);
		}
		if (typeof value === "string") {
			return renderMetadataString(value);
		}
		return [{ kind: "text", text: String(value) }];
	}

	function renderMetadataString(value: string): MetadataSegment[] {
		const segments: MetadataSegment[] = [];
		let lastIndex = 0;
		for (const match of value.matchAll(wikiLinkPattern)) {
			const index = match.index ?? 0;
			const rawContent = match[1] ?? "";
			if (index > lastIndex) {
				segments.push({ kind: "text", text: value.slice(lastIndex, index) });
			}
			segments.push({
				kind: "link",
				text: readLinkLabel(rawContent),
				linkText: readLinkTarget(rawContent),
			});
			lastIndex = index + match[0].length;
		}
		if (lastIndex < value.length) {
			segments.push({ kind: "text", text: value.slice(lastIndex) });
		}
		if (segments.length > 0) {
			return segments;
		}
		return isKnownMetadataLink(value)
			? [{ kind: "link", text: value, linkText: value }]
			: [{ kind: "text", text: value }];
	}

	function isKnownMetadataLink(value: string): boolean {
		const target = readLinkTarget(value);
		return Boolean(target && node?.links?.includes(target));
	}

	function readLinkTarget(value: string): string {
		return (value.split("|")[0] ?? "").split("#")[0]?.trim() ?? "";
	}

	function readLinkLabel(value: string): string {
		return (value.split("|")[1] ?? value).trim();
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
		{#if node.domains.length}<span>Domains: {node.domains.join(", ")}</span
			>{/if}
		{#if node.metadata && Object.keys(node.metadata).length > 0}
			<hr />
			{#each Object.entries(node.metadata) as [key, value]}
				<div class="knowledge-workspace-inspector-metadata">
					<strong>{key}</strong>
					<span>
						{#each renderMetadataValue(value) as segment}
							{#if segment.kind === "link"}
								<button
									type="button"
									class="knowledge-workspace-inspector-metadata-link"
									title={segment.linkText}
									onclick={() =>
										onOpenMetadataLink(segment.linkText, node.path)}
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
