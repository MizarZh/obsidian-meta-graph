<script lang="ts">
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import ObsidianSlider from '../obsidian/ObsidianSlider.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import ObsidianToggle from '../obsidian/ObsidianToggle.svelte';
	import type {
		DefaultLinkStyle,
		LinkLineStyle,
		LinkStyleField,
		LinkStyleRule,
	} from '../../core/types';
	import { createRuleId } from '../filter/filter-tree';
	import {
		activeLinkLineStyle as resolveActiveLinkLineStyle,
		activeLinkStyleValue as resolveActiveLinkStyleValue,
		canMoveRule,
		createLinkStyleRule,
		hasStyleOverride,
		moveRule,
		patchRule,
		removeRule,
		type StyleRuleScope,
	} from '../filter/filter-style-rules';

	const LINK_STYLE_FIELD_OPTIONS = [
		{ value: 'relation', label: 'Relation' },
		{ value: 'source-field', label: 'Metadata field' },
	];
	const LINE_STYLE_OPTIONS = [
		{ value: 'solid', label: 'Solid' },
		{ value: 'dashed', label: 'Dashed' },
		{ value: 'dotted', label: 'Dotted' },
	];

	let {
		defaultLinkStyle,
		globalLinkStyleRules,
		linkStyleOverrides,
		linkStyleRules,
		onDefaultLinkStyle,
		onGlobalLinkStyleRulesChange,
		onLinkStyleOverrides,
		onLinkStyleRulesChange,
		scheduleColorCommit,
		commitColor,
	}: {
		defaultLinkStyle: Required<DefaultLinkStyle>;
		globalLinkStyleRules: LinkStyleRule[];
		linkStyleOverrides: DefaultLinkStyle;
		linkStyleRules: LinkStyleRule[];
		onDefaultLinkStyle: (style: Required<DefaultLinkStyle>) => void;
		onGlobalLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
		onLinkStyleOverrides: (style: DefaultLinkStyle) => void;
		onLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
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

	function addLinkRule(scope: 'global' | 'current'): void {
		updateLinkRules(scope, [
			...getLinkRules(scope),
			createLinkStyleRule(createRuleId()),
		]);
	}

	function updateLinkRule(
		scope: 'global' | 'current',
		id: string,
		patch: Partial<LinkStyleRule>,
	): void {
		updateLinkRules(scope, patchRule(getLinkRules(scope), id, patch));
	}

	function updateLinkRules(
		scope: 'global' | 'current',
		rules: LinkStyleRule[],
	): void {
		if (scope === 'global') {
			onGlobalLinkStyleRulesChange(rules);
		} else {
			onLinkStyleRulesChange(rules);
		}
	}

	function getLinkRules(scope: 'global' | 'current'): LinkStyleRule[] {
		return scope === 'global' ? globalLinkStyleRules : linkStyleRules;
	}

	function moveLinkRule(
		scope: StyleRuleScope,
		id: string,
		direction: -1 | 1,
	): void {
		updateLinkRules(scope, moveRule(getLinkRules(scope), id, direction));
	}

	function updateDefaultLinkStyle(patch: Partial<DefaultLinkStyle>): void {
		onDefaultLinkStyle({ ...defaultLinkStyle, ...patch });
	}

	function updateLinkOverride(patch: DefaultLinkStyle): void {
		onLinkStyleOverrides({ ...linkStyleOverrides, ...patch });
	}

	function addLinkOverride(): void {
		onLinkStyleOverrides({ ...defaultLinkStyle });
	}

	function clearLinkOverride(): void {
		onLinkStyleOverrides({});
	}

	function activeLinkStyleValue(
		field: keyof DefaultLinkStyle,
	): string | number | boolean {
		return resolveActiveLinkStyleValue(
			linkStyleOverrides,
			defaultLinkStyle,
			field,
		);
	}

	function activeLinkColor(): string {
		return String(activeLinkStyleValue('color'));
	}

	function activeLinkSize(): number {
		return Number(activeLinkStyleValue('size'));
	}

	function activeLinkLineStyle(): LinkLineStyle {
		return resolveActiveLinkLineStyle(linkStyleOverrides, defaultLinkStyle);
	}

	function activeLinkLabel(): string {
		return String(activeLinkStyleValue('label'));
	}

	function activeLinkShowLabel(): boolean {
		return Boolean(activeLinkStyleValue('showLabel'));
	}

	function activeLinkHidden(): boolean {
		return Boolean(activeLinkStyleValue('hidden'));
	}

	function hasLinkOverride(): boolean {
		return hasStyleOverride(linkStyleOverrides);
	}

	function removeLinkRule(scope: 'global' | 'current', id: string): void {
		updateLinkRules(scope, removeRule(getLinkRules(scope), id));
	}
</script>

<section>
	<header><h3>Link styles</h3></header>
</section>
<section>
	<header><h3>Workspace default</h3></header>
	<div class="knowledge-workspace-rule">
		<div class="knowledge-workspace-rule-row compact">
			<label>
				<span>Color</span>
				<input
					type="color"
					value={defaultLinkStyle.color}
					oninput={(event) =>
						scheduleColorCommit(
							'link:workspace-default',
							defaultLinkStyle.color,
							event.currentTarget.value,
							(color) => updateDefaultLinkStyle({ color }),
						)}
					onchange={(event) =>
						commitColor(
							'link:workspace-default',
							defaultLinkStyle.color,
							event.currentTarget.value,
							(color) => updateDefaultLinkStyle({ color }),
						)}
				/>
			</label>
			<label>
				<span>Width</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						min={0.5}
						max={10}
						step={0.5}
						value={defaultLinkStyle.size}
						format={(value) => value.toFixed(1)}
						onChange={(size) => updateDefaultLinkStyle({ size })}
					/>
					<span>{defaultLinkStyle.size.toFixed(1)}</span>
				</div>
			</label>
		</div>
		<div class="knowledge-workspace-line-style-row">
			<span>Line</span>
			<div class="knowledge-workspace-segmented">
				{#each LINE_STYLE_OPTIONS as option}
					<ObsidianButton
						active={defaultLinkStyle.lineStyle === option.value}
						text={option.label}
						onClick={() =>
							updateDefaultLinkStyle({
								lineStyle: option.value as LinkLineStyle,
							})}
					/>
				{/each}
			</div>
		</div>
		<div class="knowledge-workspace-rule-row link-line-label">
			<label class="knowledge-workspace-rule-label">
				<span>Label</span>
				<ObsidianTextInput
					type="text"
					placeholder="Optional label"
					value={defaultLinkStyle.label}
					onInput={(label) => updateDefaultLinkStyle({ label })}
				/>
			</label>
		</div>
		<div class="knowledge-workspace-toggle-row">
			<label class="checkbox">
				<ObsidianToggle
					value={defaultLinkStyle.showLabel}
					onChange={(showLabel) => updateDefaultLinkStyle({ showLabel })}
				/>
				<span>Show label</span>
			</label>
			<label class="checkbox">
				<ObsidianToggle
					value={defaultLinkStyle.hidden}
					onChange={(hidden) => updateDefaultLinkStyle({ hidden })}
				/>
				<span>Hidden</span>
			</label>
		</div>
	</div>
</section>
<section>
	<header>
		<h3>Chart overrides</h3>
		{#if !hasLinkOverride()}
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add chart link override"
				icon="plus"
				onClick={addLinkOverride}
			/>
		{/if}
	</header>
	{#if hasLinkOverride()}
		<div class="knowledge-workspace-rule">
			<div class="knowledge-workspace-rule-row override-heading">
				<strong>This chart</strong>
				<ObsidianButton
					class="knowledge-workspace-remove-rule-button"
					ariaLabel="Remove chart link override"
					icon="trash-2"
					onClick={clearLinkOverride}
				/>
			</div>
			<div class="knowledge-workspace-rule-row compact">
				<label>
					<span>Color</span>
					<input
						type="color"
						value={activeLinkColor()}
						oninput={(event) =>
							scheduleColorCommit(
								'link:chart-override',
								activeLinkColor(),
								event.currentTarget.value,
								(color) => updateLinkOverride({ color }),
							)}
						onchange={(event) =>
							commitColor(
								'link:chart-override',
								activeLinkColor(),
								event.currentTarget.value,
								(color) => updateLinkOverride({ color }),
							)}
					/>
				</label>
				<label>
					<span>Width</span>
					<div class="knowledge-workspace-slider-value">
						<ObsidianSlider
							min={0.5}
							max={10}
							step={0.5}
							value={activeLinkSize()}
							format={(value) => value.toFixed(1)}
							onChange={(size) => updateLinkOverride({ size })}
						/>
						<span>{activeLinkSize().toFixed(1)}</span>
					</div>
				</label>
			</div>
			<div class="knowledge-workspace-line-style-row">
				<span>Line</span>
				<div class="knowledge-workspace-segmented">
					{#each LINE_STYLE_OPTIONS as option}
						<ObsidianButton
							active={activeLinkLineStyle() === option.value}
							text={option.label}
							onClick={() =>
								updateLinkOverride({
									lineStyle: option.value as LinkLineStyle,
								})}
						/>
					{/each}
				</div>
			</div>
			<div class="knowledge-workspace-rule-row link-line-label">
				<label class="knowledge-workspace-rule-label">
					<span>Label</span>
					<ObsidianTextInput
						type="text"
						placeholder="Optional label"
						value={activeLinkLabel()}
						onInput={(label) => updateLinkOverride({ label })}
					/>
				</label>
			</div>
			<div class="knowledge-workspace-toggle-row">
				<label class="checkbox">
					<ObsidianToggle
						value={activeLinkShowLabel()}
						onChange={(showLabel) => updateLinkOverride({ showLabel })}
					/>
					<span>Show label</span>
				</label>
				<label class="checkbox">
					<ObsidianToggle
						value={activeLinkHidden()}
						onChange={(hidden) => updateLinkOverride({ hidden })}
					/>
					<span>Hidden</span>
				</label>
			</div>
		</div>
	{/if}
</section>
{#each ['global', 'current'] as scope}
	<section>
		<header>
			<h3>
				{scope === 'global' ? 'Global link rules' : 'Chart link rules'}
			</h3>
			<ObsidianButton
				class="knowledge-workspace-add-rule-button"
				ariaLabel="Add link style rule"
				icon="plus"
				onClick={() => addLinkRule(scope as 'global' | 'current')}
			/>
		</header>
		{#each getLinkRules(scope as 'global' | 'current') as rule (rule.id)}
			<div class="knowledge-workspace-rule">
				<div class="knowledge-workspace-rule-row">
					<div class="knowledge-workspace-move-rule-buttons">
						<ObsidianButton
							icon="chevron-up"
							ariaLabel="Move link style rule up"
							disabled={!canMoveRule(
								getLinkRules(scope as StyleRuleScope),
								rule.id,
								-1,
							)}
							onClick={() =>
								moveLinkRule(scope as StyleRuleScope, rule.id, -1)}
						/>
						<ObsidianButton
							icon="chevron-down"
							ariaLabel="Move link style rule down"
							disabled={!canMoveRule(
								getLinkRules(scope as StyleRuleScope),
								rule.id,
								1,
							)}
							onClick={() =>
								moveLinkRule(scope as StyleRuleScope, rule.id, 1)}
						/>
					</div>
					<ObsidianDropdown
						value={rule.field}
						options={LINK_STYLE_FIELD_OPTIONS}
						onChange={(value) =>
							updateLinkRule(scope as 'global' | 'current', rule.id, {
								field: value as LinkStyleField,
							})}
					/>
					<ObsidianTextInput
						type="text"
						placeholder="Metadata value"
						value={rule.value}
						onInput={(value) =>
							updateLinkRule(scope as 'global' | 'current', rule.id, {
								value,
							})}
					/>
					<ObsidianButton
						class="knowledge-workspace-remove-rule-button"
						ariaLabel="Remove link style rule"
						icon="trash-2"
						onClick={() => removeLinkRule(scope as 'global' | 'current', rule.id)}
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
									`link:${scope}:${rule.id}`,
									rule.color,
									event.currentTarget.value,
									(color) =>
										updateLinkRule(scope as 'global' | 'current', rule.id, {
											color,
										}),
								)}
							onchange={(event) =>
								commitColor(
									`link:${scope}:${rule.id}`,
									rule.color,
									event.currentTarget.value,
									(color) =>
										updateLinkRule(scope as 'global' | 'current', rule.id, {
											color,
										}),
								)}
						/>
					</label>
					<label>
						<span>Width</span>
						<div class="knowledge-workspace-slider-value">
							<ObsidianSlider
								min={0.5}
								max={10}
								step={0.5}
								value={rule.size}
								format={(value) => value.toFixed(1)}
								onChange={(value) =>
									updateLinkRule(scope as 'global' | 'current', rule.id, {
										size: value,
									})}
							/>
							<span>{rule.size.toFixed(1)}</span>
						</div>
					</label>
				</div>
				<div class="knowledge-workspace-line-style-row">
					<span>Line</span>
					<div class="knowledge-workspace-segmented">
						{#each LINE_STYLE_OPTIONS as option}
							<ObsidianButton
								active={rule.lineStyle === option.value}
								text={option.label}
								onClick={() =>
									updateLinkRule(scope as 'global' | 'current', rule.id, {
										lineStyle: option.value as LinkLineStyle,
									})}
							/>
						{/each}
					</div>
				</div>
				<div class="knowledge-workspace-rule-row link-line-label">
					<label class="knowledge-workspace-rule-label">
						<span>Label</span>
						<ObsidianTextInput
							type="text"
							placeholder="Optional label"
							value={rule.label}
							onInput={(value) =>
								updateLinkRule(scope as 'global' | 'current', rule.id, {
									label: value,
								})}
						/>
					</label>
				</div>
				<div class="knowledge-workspace-toggle-row">
					<label class="checkbox">
						<ObsidianToggle
							value={rule.showLabel}
							onChange={(value) =>
								updateLinkRule(scope as 'global' | 'current', rule.id, {
									showLabel: value,
								})}
						/>
						<span>Show label</span>
					</label>
					<label class="checkbox">
						<ObsidianToggle
							value={rule.hidden}
							onChange={(value) =>
								updateLinkRule(scope as 'global' | 'current', rule.id, {
									hidden: value,
								})}
						/>
						<span>Hidden</span>
					</label>
				</div>
			</div>
		{/each}
	</section>
{/each}
