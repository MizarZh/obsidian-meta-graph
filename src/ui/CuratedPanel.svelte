<script lang="ts">
	import type { App } from "obsidian";
	import type {
		CuratedWorkspaceConfig,
		KnowledgeNode,
	} from "../core/types";
	import ObsidianButton from "./obsidian/ObsidianButton.svelte";
	import ObsidianSuggestInput from "./obsidian/ObsidianSuggestInput.svelte";

	let {
		app,
		curated,
		nodes,
		workspaceFilePath,
		onAddFile,
		onRemoveFile,
	}: {
		app: App;
		curated: CuratedWorkspaceConfig;
		nodes: KnowledgeNode[];
		workspaceFilePath?: string;
		onAddFile: (path: string) => void;
		onRemoveFile: (path: string) => void;
	} = $props();

	let fileSearch = $state("");

	const selectedPaths = $derived(new Set(curated.files.map((file) => file.path)));
	const nodesByPath = $derived(new Map(nodes.map((node) => [node.path, node])));
	const selectedFiles = $derived(
		curated.files.map((file) => {
			const node = nodesByPath.get(file.path);
			return {
				path: file.path,
				title: node?.title ?? formatFileTitle(file.path),
				detail: node?.folder || file.path,
				missing: !node,
			};
		}),
	);
	const fileOptions = $derived(
		nodes
			.filter(
				(node) =>
					node.path !== workspaceFilePath &&
					!selectedPaths.has(node.path),
			)
			.map((node) => ({
				value: node.path,
				label: node.title,
				detail: node.path,
				searchText: [node.title, node.path, ...(node.aliases ?? [])].join(
					" ",
				),
			})),
	);

	function formatFileTitle(path: string): string {
		return path.split("/").pop()?.replace(/\.md$/u, "") ?? path;
	}
</script>

<div class="knowledge-workspace-curated">
	<section>
		<header>
			<h3>Workspace files</h3>
			<span>{selectedFiles.length}</span>
		</header>
		<ObsidianSuggestInput
			{app}
			type="search"
			placeholder="Add note..."
			ariaLabel="Add note to workspace"
			value={fileSearch}
			options={fileOptions}
			onInput={(value) => {
				fileSearch = value;
			}}
			onSelect={(option) => {
				onAddFile(option.value);
				fileSearch = "";
			}}
		/>
	</section>
	<section>
		<div class="knowledge-workspace-curated-list">
			{#each selectedFiles as file (file.path)}
				<div
					class="knowledge-workspace-curated-file"
					class:missing={file.missing}
				>
					<span>
						<strong>{file.title}</strong>
						<small>{file.detail}</small>
					</span>
					<ObsidianButton
						ariaLabel={`Remove ${file.title}`}
						icon="x"
						onClick={() => onRemoveFile(file.path)}
					/>
				</div>
			{:else}
				<div class="knowledge-workspace-curated-empty">
					No files selected.
				</div>
			{/each}
		</div>
	</section>
</div>
