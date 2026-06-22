<script lang="ts">
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import ObsidianTextInput from './obsidian/ObsidianTextInput.svelte';
	import ObsidianToggle from './obsidian/ObsidianToggle.svelte';
	import type {
		GraphQuery,
		LinkStyleField,
		LinkLineStyle,
		LinkStyleRule,
		NodeFilterAction,
		NodeFilterField,
		NodeFilterRule,
		NodeStyleField,
		NodeStyleRule,
	} from '../core/types';

	let {
		query,
		folders,
		tags,
		nodeStyleRules,
		linkStyleRules,
		onChange,
		onNodeStyleRulesChange,
		onLinkStyleRulesChange,
	}: {
		query: GraphQuery;
		folders: string[];
		tags: string[];
		nodeStyleRules: NodeStyleRule[];
		linkStyleRules: LinkStyleRule[];
		onChange: (patch: Partial<Omit<GraphQuery, 'roots'>>) => void;
		onNodeStyleRulesChange: (rules: NodeStyleRule[]) => void;
		onLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
	} = $props();

	const NODE_STYLE_FIELD_OPTIONS = [
		{ value: 'folder', label: 'Folder' },
		{ value: 'tag', label: 'Tag' },
		{ value: 'domain', label: 'Domain' },
		{ value: 'type', label: 'Type' },
		{ value: 'title', label: 'Title' },
	];
	const BASE_NODE_STYLE_FIELD_OPTIONS = [
		{ value: 'all', label: 'All' },
		...NODE_STYLE_FIELD_OPTIONS,
	];
	const LINK_STYLE_FIELD_OPTIONS = [
		{ value: 'relation', label: 'Relation' },
		{ value: 'source-field', label: 'Frontmatter field' },
	];
	const BASE_LINK_STYLE_FIELD_OPTIONS = [
		{ value: 'all', label: 'All' },
		...LINK_STYLE_FIELD_OPTIONS,
	];
	const LINE_STYLE_OPTIONS = [
		{ value: 'solid', label: 'Solid' },
		{ value: 'dashed', label: 'Dashed' },
		{ value: 'dotted', label: 'Dotted' },
	];
	const FILTER_ACTION_OPTIONS = [
		{ value: 'hide', label: 'Hide' },
		{ value: 'show', label: 'Show' },
	];
	const FILTER_FIELD_OPTIONS = [
		{ value: 'folder', label: 'Folder' },
		{ value: 'tag', label: 'Tag' },
	];

	function addNodeRule(): void {
		onNodeStyleRulesChange([
			...nodeStyleRules,
			{
				id: createRuleId(),
				field: 'tag',
				value: '',
				color: '#7c6ff0',
				size: 7,
			},
		]);
	}

	function updateNodeRule(
		id: string,
		patch: Partial<NodeStyleRule>,
	): void {
		onNodeStyleRulesChange(
			nodeStyleRules.map((rule) =>
				rule.id === id ? { ...rule, ...patch } : rule,
			),
		);
	}

	function addLinkRule(): void {
		onLinkStyleRulesChange([
			...linkStyleRules,
			{
				id: createRuleId(),
				field: 'relation',
				value: 'leads-to',
				color: '#888888',
				size: 1.5,
				lineStyle: 'solid',
				label: '',
				showLabel: false,
				hidden: false,
			},
		]);
	}

	function updateLinkRule(
		id: string,
		patch: Partial<LinkStyleRule>,
	): void {
		onLinkStyleRulesChange(
			linkStyleRules.map((rule) =>
				rule.id === id ? { ...rule, ...patch } : rule,
			),
		);
	}

	function addFilterRule(): void {
		onChange({
			hiddenNodeRules: [
				...query.hiddenNodeRules,
				{
					id: createRuleId(),
					action: 'hide',
					field: 'folder',
					value: '',
				},
			],
		});
	}

	function updateFilterRule(
		id: string,
		patch: Partial<NodeFilterRule>,
	): void {
		onChange({
			hiddenNodeRules: query.hiddenNodeRules.map((rule) =>
				rule.id === id ? { ...rule, ...patch } : rule,
			),
		});
	}

	function createRuleId(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	function isBaseStyleRule(rule: NodeStyleRule | LinkStyleRule): boolean {
		return rule.id === 'all' || rule.field === 'all';
	}
</script>

<aside class="knowledge-workspace-filters">
	<section>
		<header>
			<h3>Node styles</h3>
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add node style rule"
				icon="plus"
				onClick={addNodeRule}
			/>
		</header>
		{#each nodeStyleRules as rule (rule.id)}
			<div class="knowledge-workspace-rule">
				<div class="knowledge-workspace-rule-row">
					<ObsidianDropdown
						disabled={isBaseStyleRule(rule)}
						value={rule.field}
						options={isBaseStyleRule(rule)
							? BASE_NODE_STYLE_FIELD_OPTIONS
							: NODE_STYLE_FIELD_OPTIONS}
						onChange={(value) =>
							updateNodeRule(rule.id, {
								field: value as NodeStyleField,
							})}
					/>
					<ObsidianTextInput
						type="text"
						placeholder={isBaseStyleRule(rule) ? "All nodes" : "Match value"}
						disabled={isBaseStyleRule(rule)}
						value={rule.value}
						onInput={(value) =>
							updateNodeRule(rule.id, {
								value,
							})}
					/>
					<ObsidianButton
						class="knowledge-workspace-remove-rule-button"
						ariaLabel="Remove node style rule"
						disabled={isBaseStyleRule(rule)}
						icon="x"
						onClick={() =>
							onNodeStyleRulesChange(
								nodeStyleRules.filter((item) => item.id !== rule.id),
							)}
					/>
				</div>
				<div class="knowledge-workspace-rule-row compact">
					<label>
						<span>Color</span>
						<input
							type="color"
							value={rule.color}
							oninput={(event) =>
								updateNodeRule(rule.id, {
									color: event.currentTarget.value,
								})}
						/>
					</label>
					<label>
						<span>Size</span>
						<ObsidianTextInput
							type="number"
							min="1"
							max="30"
							step="0.5"
							value={rule.size}
							onChange={(value) =>
								updateNodeRule(rule.id, {
									size: Number(value),
								})}
						/>
					</label>
				</div>
			</div>
		{/each}
	</section>

	<section>
		<header>
			<h3>Link styles</h3>
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add link style rule"
				icon="plus"
				onClick={addLinkRule}
			/>
		</header>
		{#each linkStyleRules as rule (rule.id)}
			<div class="knowledge-workspace-rule">
				<div class="knowledge-workspace-rule-row">
					<ObsidianDropdown
						disabled={isBaseStyleRule(rule)}
						value={rule.field}
						options={isBaseStyleRule(rule)
							? BASE_LINK_STYLE_FIELD_OPTIONS
							: LINK_STYLE_FIELD_OPTIONS}
						onChange={(value) =>
							updateLinkRule(rule.id, {
								field: value as LinkStyleField,
							})}
					/>
					<ObsidianTextInput
						type="text"
						placeholder={isBaseStyleRule(rule) ? "All links" : "Match value"}
						disabled={isBaseStyleRule(rule)}
						value={rule.value}
						onInput={(value) =>
							updateLinkRule(rule.id, {
								value,
							})}
					/>
					<ObsidianButton
						class="knowledge-workspace-remove-rule-button"
						ariaLabel="Remove link style rule"
						disabled={isBaseStyleRule(rule)}
						icon="x"
						onClick={() =>
							onLinkStyleRulesChange(
								linkStyleRules.filter((item) => item.id !== rule.id),
							)}
					/>
				</div>
				<div class="knowledge-workspace-rule-row compact">
					<label>
						<span>Color</span>
						<input
							type="color"
							value={rule.color}
							oninput={(event) =>
								updateLinkRule(rule.id, {
									color: event.currentTarget.value,
								})}
						/>
					</label>
					<label>
						<span>Width</span>
						<ObsidianTextInput
							type="number"
							min="0.5"
							max="10"
							step="0.5"
							value={rule.size}
							onChange={(value) =>
								updateLinkRule(rule.id, {
									size: Number(value),
								})}
						/>
					</label>
				</div>
				<label class="knowledge-workspace-rule-label">
					<span>Line</span>
					<ObsidianDropdown
						value={rule.lineStyle}
						options={LINE_STYLE_OPTIONS}
						onChange={(value) =>
							updateLinkRule(rule.id, {
								lineStyle: value as LinkLineStyle,
							})}
					/>
				</label>
				<label class="knowledge-workspace-rule-label">
					<span>Label</span>
					<ObsidianTextInput
						type="text"
						placeholder="Optional edge label"
						value={rule.label}
						onInput={(value) =>
							updateLinkRule(rule.id, {
								label: value,
							})}
					/>
				</label>
				<label class="checkbox">
					<ObsidianToggle
						value={rule.showLabel}
						onChange={(value) =>
							updateLinkRule(rule.id, {
								showLabel: value,
							})}
					/>
					<span>Show label</span>
				</label>
				<label class="checkbox">
					<ObsidianToggle
						value={rule.hidden}
						onChange={(value) =>
							updateLinkRule(rule.id, {
								hidden: value,
							})}
					/>
					<span>Hidden</span>
				</label>
			</div>
		{/each}
	</section>

	<section>
		<header>
			<h3>Filters</h3>
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add filter rule"
				icon="plus"
				onClick={addFilterRule}
			/>
		</header>
		{#each query.hiddenNodeRules as rule (rule.id)}
			<div class="knowledge-workspace-rule">
				<div class="knowledge-workspace-rule-row filter">
					<ObsidianDropdown
						ariaLabel="Filter action"
						value={rule.action}
						options={FILTER_ACTION_OPTIONS}
						onChange={(value) =>
							updateFilterRule(rule.id, {
								action: value as NodeFilterAction,
							})}
					/>
					<ObsidianDropdown
						value={rule.field}
						options={FILTER_FIELD_OPTIONS}
						onChange={(value) =>
							updateFilterRule(rule.id, {
								field: value as NodeFilterField,
							})}
					/>
					<ObsidianTextInput
						type="text"
						list={rule.field === 'folder'
							? 'knowledge-workspace-folder-options'
							: 'knowledge-workspace-tag-options'}
						placeholder={`${rule.action === 'show' ? 'Show' : 'Hide'} matching value`}
						value={rule.value}
						onInput={(value) =>
							updateFilterRule(rule.id, {
								value,
							})}
					/>
					<ObsidianButton
						class="knowledge-workspace-remove-rule-button"
						ariaLabel="Remove filter rule"
						icon="x"
						onClick={() =>
							onChange({
								hiddenNodeRules: query.hiddenNodeRules.filter(
									(item) => item.id !== rule.id,
								),
							})}
					/>
				</div>
				<span class="knowledge-workspace-rule-hint">
					{rule.action === 'show'
						? 'Show matching nodes'
						: 'Hide matching nodes'}
				</span>
			</div>
		{/each}
		<datalist id="knowledge-workspace-folder-options">
			{#each folders as folder}<option value={folder}></option>{/each}
		</datalist>
		<datalist id="knowledge-workspace-tag-options">
			{#each tags as tag}<option value={tag}></option>{/each}
		</datalist>
	</section>
</aside>
