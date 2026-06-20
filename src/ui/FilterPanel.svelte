<script lang="ts">
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
			<button
				class="knowledge-workspace-add-rule-button"
				aria-label="Add node style rule"
				onclick={addNodeRule}
			>
				<span aria-hidden="true"></span>
			</button>
		</header>
		{#each nodeStyleRules as rule (rule.id)}
			<div class="knowledge-workspace-rule">
				<div class="knowledge-workspace-rule-row">
					<select
						disabled={isBaseStyleRule(rule)}
						value={rule.field}
						onchange={(event) =>
							updateNodeRule(rule.id, {
								field: event.currentTarget.value as NodeStyleField,
							})}
					>
						{#if isBaseStyleRule(rule)}
							<option value="all">All</option>
						{/if}
						<option value="folder">Folder</option>
						<option value="tag">Tag</option>
						<option value="domain">Domain</option>
						<option value="type">Type</option>
						<option value="title">Title</option>
					</select>
					<input
						type="text"
						placeholder={isBaseStyleRule(rule) ? "All nodes" : "Match value"}
						disabled={isBaseStyleRule(rule)}
						value={rule.value}
						oninput={(event) =>
							updateNodeRule(rule.id, {
								value: event.currentTarget.value,
							})}
					/>
					<button
						class="knowledge-workspace-remove-rule-button"
						aria-label="Remove node style rule"
						disabled={isBaseStyleRule(rule)}
						onclick={() =>
							onNodeStyleRulesChange(
								nodeStyleRules.filter((item) => item.id !== rule.id),
							)}
					>
						<span aria-hidden="true"></span>
					</button>
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
						<input
							type="number"
							min="1"
							max="30"
							step="0.5"
							value={rule.size}
							onchange={(event) =>
								updateNodeRule(rule.id, {
									size: Number(event.currentTarget.value),
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
			<button
				class="knowledge-workspace-add-rule-button"
				aria-label="Add link style rule"
				onclick={addLinkRule}
			>
				<span aria-hidden="true"></span>
			</button>
		</header>
		{#each linkStyleRules as rule (rule.id)}
			<div class="knowledge-workspace-rule">
				<div class="knowledge-workspace-rule-row">
					<select
						disabled={isBaseStyleRule(rule)}
						value={rule.field}
						onchange={(event) =>
							updateLinkRule(rule.id, {
								field: event.currentTarget.value as LinkStyleField,
							})}
					>
						{#if isBaseStyleRule(rule)}
							<option value="all">All</option>
						{/if}
						<option value="relation">Relation</option>
						<option value="source-field">Frontmatter field</option>
					</select>
					<input
						type="text"
						placeholder={isBaseStyleRule(rule) ? "All links" : "Match value"}
						disabled={isBaseStyleRule(rule)}
						value={rule.value}
						oninput={(event) =>
							updateLinkRule(rule.id, {
								value: event.currentTarget.value,
							})}
					/>
					<button
						class="knowledge-workspace-remove-rule-button"
						aria-label="Remove link style rule"
						disabled={isBaseStyleRule(rule)}
						onclick={() =>
							onLinkStyleRulesChange(
								linkStyleRules.filter((item) => item.id !== rule.id),
							)}
					>
						<span aria-hidden="true"></span>
					</button>
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
						<input
							type="number"
							min="0.5"
							max="10"
							step="0.5"
							value={rule.size}
							onchange={(event) =>
								updateLinkRule(rule.id, {
									size: Number(event.currentTarget.value),
								})}
						/>
					</label>
				</div>
				<label class="knowledge-workspace-rule-label">
					<span>Line</span>
					<select
						value={rule.lineStyle}
						onchange={(event) =>
							updateLinkRule(rule.id, {
								lineStyle: event.currentTarget.value as LinkLineStyle,
							})}
					>
						<option value="solid">Solid</option>
						<option value="dashed">Dashed</option>
						<option value="dotted">Dotted</option>
					</select>
				</label>
				<label class="knowledge-workspace-rule-label">
					<span>Label</span>
					<input
						type="text"
						placeholder="Optional edge label"
						value={rule.label}
						oninput={(event) =>
							updateLinkRule(rule.id, {
								label: event.currentTarget.value,
							})}
					/>
				</label>
				<label class="checkbox">
					<input
						type="checkbox"
						checked={rule.showLabel}
						onchange={(event) =>
							updateLinkRule(rule.id, {
								showLabel: event.currentTarget.checked,
							})}
					/>
					<span>Show label</span>
				</label>
				<label class="checkbox">
					<input
						type="checkbox"
						checked={rule.hidden}
						onchange={(event) =>
							updateLinkRule(rule.id, {
								hidden: event.currentTarget.checked,
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
			<button
				class="knowledge-workspace-add-rule-button"
				aria-label="Add filter rule"
				onclick={addFilterRule}
			>
				<span aria-hidden="true"></span>
			</button>
		</header>
		{#each query.hiddenNodeRules as rule (rule.id)}
			<div class="knowledge-workspace-rule">
				<div class="knowledge-workspace-rule-row filter">
					<select
						aria-label="Filter action"
						value={rule.action}
						onchange={(event) =>
							updateFilterRule(rule.id, {
								action: event.currentTarget.value as NodeFilterAction,
							})}
					>
						<option value="hide">Hide</option>
						<option value="show">Show</option>
					</select>
					<select
						value={rule.field}
						onchange={(event) =>
							updateFilterRule(rule.id, {
								field: event.currentTarget.value as NodeFilterField,
							})}
					>
						<option value="folder">Folder</option>
						<option value="tag">Tag</option>
					</select>
					<input
						type="text"
						list={rule.field === 'folder'
							? 'knowledge-workspace-folder-options'
							: 'knowledge-workspace-tag-options'}
						placeholder={`${rule.action === 'show' ? 'Show' : 'Hide'} matching value`}
						value={rule.value}
						oninput={(event) =>
							updateFilterRule(rule.id, {
								value: event.currentTarget.value,
							})}
					/>
					<button
						class="knowledge-workspace-remove-rule-button"
						aria-label="Remove filter rule"
						onclick={() =>
							onChange({
								hiddenNodeRules: query.hiddenNodeRules.filter(
									(item) => item.id !== rule.id,
								),
							})}
					>
						<span aria-hidden="true"></span>
					</button>
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
