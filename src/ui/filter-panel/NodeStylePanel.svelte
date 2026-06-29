<script lang="ts">
	import type { App } from 'obsidian';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import ObsidianSlider from '../obsidian/ObsidianSlider.svelte';
	import ObsidianSuggestInput, {
		type SuggestionOption,
	} from '../obsidian/ObsidianSuggestInput.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import {
		FILE_FILTER_FIELD_OPTIONS,
		TEXT_FILTER_OPERATOR_OPTIONS,
		getNodeValueOptions as resolveNodeValueOptions,
	} from '../filter-config';
	import type {
		DefaultNodeStyle,
		NodeFilterField,
		NodeFilterOperator,
		NodeStyleField,
		NodeStyleRule,
	} from '../../core/types';
	import {
		createRuleId,
		shouldShowFilterValue,
	} from '../filter/filter-tree';
	import {
		activeNodeStyleValue as resolveActiveNodeStyleValue,
		canMoveRule,
		createNodeStyleRule,
		hasStyleOverride,
		moveRule,
		patchRule,
		removeRule,
		type StyleRuleScope,
	} from '../filter/filter-style-rules';

	const NODE_STYLE_FIELD_OPTIONS = [
		{ value: 'folder', label: 'Folder' },
		{ value: 'tag', label: 'Tag' },
		{ value: 'domain', label: 'Domain' },
		{ value: 'type', label: 'Type' },
		{ value: 'title', label: 'Title' },
		...FILE_FILTER_FIELD_OPTIONS,
	];
	const STYLE_FILTER_OPERATOR_OPTIONS = TEXT_FILTER_OPERATOR_OPTIONS;

	let {
		app,
		folders,
		tags,
		metadataFieldSuggestions,
		metadataFieldTypes,
		metadataFieldValueSuggestions,
		filePathSuggestions,
		defaultNodeStyle,
		globalNodeStyleRules,
		nodeStyleOverrides,
		nodeStyleRules,
		onDefaultNodeStyle,
		onGlobalNodeStyleRulesChange,
		onNodeStyleOverrides,
		onNodeStyleRulesChange,
		scheduleColorCommit,
		commitColor,
	}: {
		app: App;
		folders: string[];
		tags: string[];
		metadataFieldSuggestions: string[];
		metadataFieldTypes: Record<string, string>;
		metadataFieldValueSuggestions: Record<string, string[]>;
		filePathSuggestions: string[];
		defaultNodeStyle: Required<DefaultNodeStyle>;
		globalNodeStyleRules: NodeStyleRule[];
		nodeStyleOverrides: DefaultNodeStyle;
		nodeStyleRules: NodeStyleRule[];
		onDefaultNodeStyle: (style: Required<DefaultNodeStyle>) => void;
		onGlobalNodeStyleRulesChange: (rules: NodeStyleRule[]) => void;
		onNodeStyleOverrides: (style: DefaultNodeStyle) => void;
		onNodeStyleRulesChange: (rules: NodeStyleRule[]) => void;
		scheduleColorCommit: (
			key: string,
			currentColor: string,
			nextColor: string,
			commit: (color: string) => void,
		) => void;
		commitColor: (
			key: string,
			currentColor: string,
			nextColor: string,
			commit: (color: string) => void,
		) => void;
	} = $props();

	function addNodeRule(scope: 'global' | 'current'): void {
		updateNodeRules(scope, [
			...getNodeRules(scope),
			createNodeStyleRule(createRuleId()),
		]);
	}

	function updateNodeRule(
		scope: 'global' | 'current',
		id: string,
		patch: Partial<NodeStyleRule>,
	): void {
		updateNodeRules(scope, patchRule(getNodeRules(scope), id, patch));
	}

	function updateNodeRules(
		scope: 'global' | 'current',
		rules: NodeStyleRule[],
	): void {
		if (scope === 'global') {
			onGlobalNodeStyleRulesChange(rules);
		} else {
			onNodeStyleRulesChange(rules);
		}
	}

	function getNodeRules(scope: 'global' | 'current'): NodeStyleRule[] {
		return scope === 'global' ? globalNodeStyleRules : nodeStyleRules;
	}

	function moveNodeRule(
		scope: StyleRuleScope,
		id: string,
		direction: -1 | 1,
	): void {
		updateNodeRules(scope, moveRule(getNodeRules(scope), id, direction));
	}

	function updateDefaultNodeStyle(patch: Partial<DefaultNodeStyle>): void {
		onDefaultNodeStyle({ ...defaultNodeStyle, ...patch });
	}

	function updateNodeOverride(patch: DefaultNodeStyle): void {
		onNodeStyleOverrides({ ...nodeStyleOverrides, ...patch });
	}

	function addNodeOverride(): void {
		onNodeStyleOverrides({ ...defaultNodeStyle });
	}

	function clearNodeOverride(): void {
		onNodeStyleOverrides({});
	}

	function activeNodeStyleValue(field: keyof DefaultNodeStyle): string | number {
		return resolveActiveNodeStyleValue(
			nodeStyleOverrides,
			defaultNodeStyle,
			field,
		);
	}

	function activeNodeColor(): string {
		return String(activeNodeStyleValue('color'));
	}

	function activeNodeSize(): number {
		return Number(activeNodeStyleValue('size'));
	}

	function hasNodeOverride(): boolean {
		return hasStyleOverride(nodeStyleOverrides);
	}

	function removeNodeRule(scope: 'global' | 'current', id: string): void {
		updateNodeRules(scope, removeRule(getNodeRules(scope), id));
	}

	function getNodeValueOptions(
		field: NodeFilterField | NodeStyleField,
		operator?: NodeFilterOperator,
	): SuggestionOption[] {
		return resolveNodeValueOptions(field, operator, {
			folders,
			tags,
			metadataFieldSuggestions,
			metadataFieldTypes,
			metadataFieldValueSuggestions,
			filePathSuggestions,
		});
	}
</script>

<section>
	<header><h3>Note styles</h3></header>
</section>
<section>
	<header><h3>Workspace default</h3></header>
	<div class="knowledge-workspace-rule">
		<div class="knowledge-workspace-rule-row compact">
			<label>
				<span>Color</span>
				<input
					type="color"
					value={defaultNodeStyle.color}
					oninput={(event) =>
						scheduleColorCommit(
							'node:workspace-default',
							defaultNodeStyle.color,
							event.currentTarget.value,
							(color) => updateDefaultNodeStyle({ color }),
						)}
					onchange={(event) =>
						commitColor(
							'node:workspace-default',
							defaultNodeStyle.color,
							event.currentTarget.value,
							(color) => updateDefaultNodeStyle({ color }),
						)}
				/>
			</label>
			<label>
				<span>Size</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={1}
						max={30}
						step={0.5}
						value={defaultNodeStyle.size}
						onChange={(size) => updateDefaultNodeStyle({ size })}
					/>
					<span>{defaultNodeStyle.size.toFixed(1)}</span>
				</div>
			</label>
		</div>
	</div>
</section>
<section>
	<header>
		<h3>Chart overrides</h3>
		{#if !hasNodeOverride()}
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add chart note override"
				icon="plus"
				onClick={addNodeOverride}
			/>
		{/if}
	</header>
	{#if hasNodeOverride()}
		<div class="knowledge-workspace-rule">
			<div class="knowledge-workspace-rule-row override-heading">
				<strong>This chart</strong>
				<ObsidianButton
					class="knowledge-workspace-remove-rule-button"
					ariaLabel="Remove chart note override"
					icon="trash-2"
					onClick={clearNodeOverride}
				/>
			</div>
			<div class="knowledge-workspace-rule-row compact">
				<label>
					<span>Color</span>
					<input
						type="color"
						value={activeNodeColor()}
						oninput={(event) =>
							scheduleColorCommit(
								'node:chart-override',
								activeNodeColor(),
								event.currentTarget.value,
								(color) => updateNodeOverride({ color }),
							)}
						onchange={(event) =>
							commitColor(
								'node:chart-override',
								activeNodeColor(),
								event.currentTarget.value,
								(color) => updateNodeOverride({ color }),
							)}
					/>
				</label>
				<label>
					<span>Size</span>
					<div class="knowledge-workspace-slider-value">
						<ObsidianSlider
							min={1}
							max={30}
							step={0.5}
							value={activeNodeSize()}
							onChange={(size) => updateNodeOverride({ size })}
						/>
						<span>{activeNodeSize().toFixed(1)}</span>
					</div>
				</label>
			</div>
		</div>
	{/if}
</section>
{#each ['global', 'current'] as scope}
	<section>
		<header>
			<h3>
				{scope === 'global' ? 'Global note rules' : 'Chart note rules'}
			</h3>
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add note style rule"
				icon="plus"
				onClick={() => addNodeRule(scope as 'global' | 'current')}
			/>
		</header>
		{#each getNodeRules(scope as 'global' | 'current') as rule (rule.id)}
			<div class="knowledge-workspace-rule">
				<div class="knowledge-workspace-rule-row style-condition">
					<div class="knowledge-workspace-move-rule-buttons">
						<ObsidianButton
							icon="chevron-up"
							ariaLabel="Move note style rule up"
							disabled={!canMoveRule(
								getNodeRules(scope as StyleRuleScope),
								rule.id,
								-1,
							)}
							onClick={() =>
								moveNodeRule(scope as StyleRuleScope, rule.id, -1)}
						/>
						<ObsidianButton
							icon="chevron-down"
							ariaLabel="Move note style rule down"
							disabled={!canMoveRule(
								getNodeRules(scope as StyleRuleScope),
								rule.id,
								1,
							)}
							onClick={() =>
								moveNodeRule(scope as StyleRuleScope, rule.id, 1)}
						/>
					</div>
					<ObsidianDropdown
						value={rule.field}
						options={NODE_STYLE_FIELD_OPTIONS}
						onChange={(value) =>
							updateNodeRule(scope as 'global' | 'current', rule.id, {
								field: value as NodeStyleField,
							})}
					/>
					<ObsidianDropdown
						value={rule.operator ?? 'is'}
						options={STYLE_FILTER_OPERATOR_OPTIONS}
						onChange={(value) =>
							updateNodeRule(scope as 'global' | 'current', rule.id, {
								operator: value as NodeFilterOperator,
							})}
					/>
					{#if shouldShowFilterValue(rule.operator) && getNodeValueOptions(rule.field).length > 0}
						<ObsidianSuggestInput
							{app}
							type="text"
							placeholder="Value"
							value={rule.value}
							options={getNodeValueOptions(rule.field)}
							onInput={(value) =>
								updateNodeRule(scope as 'global' | 'current', rule.id, {
									value,
								})}
							onSelect={(option) =>
								updateNodeRule(scope as 'global' | 'current', rule.id, {
									value: option.value,
								})}
						/>
					{:else}
						<ObsidianTextInput
							type="text"
							placeholder={shouldShowFilterValue(rule.operator) ? 'Value' : ''}
							disabled={!shouldShowFilterValue(rule.operator)}
							value={rule.value}
							onInput={(value) =>
								updateNodeRule(scope as 'global' | 'current', rule.id, {
									value,
								})}
						/>
					{/if}
					<ObsidianButton
						class="knowledge-workspace-remove-rule-button"
						ariaLabel="Remove note style rule"
						icon="trash-2"
						onClick={() => removeNodeRule(scope as 'global' | 'current', rule.id)}
					/>
				</div>
				<div class="knowledge-workspace-rule-row compact">
					<label>
						<span>Color</span>
						<input
							type="color"
							value={rule.color}
							oninput={(event) =>
								scheduleColorCommit(
									`node:${scope}:${rule.id}`,
									rule.color,
									event.currentTarget.value,
									(color) =>
										updateNodeRule(scope as 'global' | 'current', rule.id, {
											color,
										}),
								)}
							onchange={(event) =>
								commitColor(
									`node:${scope}:${rule.id}`,
									rule.color,
									event.currentTarget.value,
									(color) =>
										updateNodeRule(scope as 'global' | 'current', rule.id, {
											color,
										}),
								)}
						/>
					</label>
					<label>
						<span>Size</span>
						<div class="knowledge-workspace-slider-value">
							<ObsidianSlider
								min={1}
								max={30}
								step={0.5}
								value={rule.size}
								onChange={(value) =>
									updateNodeRule(scope as 'global' | 'current', rule.id, {
										size: value,
									})}
							/>
							<span>{rule.size.toFixed(1)}</span>
						</div>
					</label>
				</div>
			</div>
		{/each}
	</section>
{/each}
