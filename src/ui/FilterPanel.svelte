<script lang="ts">
	import type { App } from 'obsidian';
	import { onDestroy } from 'svelte';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import ObsidianSuggestInput, {
		type SuggestionOption,
	} from './obsidian/ObsidianSuggestInput.svelte';
	import ObsidianSlider from './obsidian/ObsidianSlider.svelte';
	import ObsidianTextInput from './obsidian/ObsidianTextInput.svelte';
	import ObsidianToggle from './obsidian/ObsidianToggle.svelte';
	import FilterGroup from './FilterGroup.svelte';
	import {
		FILE_FILTER_FIELD_OPTIONS,
		TEXT_FILTER_OPERATOR_OPTIONS,
		getDefaultFilterOperator as resolveDefaultFilterOperator,
		getFilterFieldOptions as resolveFilterFieldOptions,
		getFilterFieldType as resolveFilterFieldType,
		getFilterGroupModeOptions,
		getFilterOperatorOptions as resolveFilterOperatorOptions,
		getNodeValueOptions as resolveNodeValueOptions,
	} from './filter-config';
	import type {
		ArcDirection,
		DefaultLinkStyle,
		DefaultNodeStyle,
		FlowDirection,
		FlowEdgeStyle,
		GraphQuery,
		LabelPosition,
		LinkStyleField,
		LinkLineStyle,
		LinkStyleRule,
		NodeFilterField,
		NodeFilterGroup,
		NodeFilterGroupMode,
		NodeFilterItem,
		NodeFilterOperator,
		NodeStyleField,
		NodeStyleRule,
		SettingsPanelMode,
		ViewMode,
	} from '../core/types';

	let {
		app,
		panel,
		mode,
		fadeDistance,
		labelSize,
			labelPosition,
			labelColor,
				labelBackgroundOpacity,
				labelDensity,
				cubeFaceOpacity,
				forceLabels,
				enableForceLayout,
		flowEdgeStyle,
		flowDirection,
		arcDirection,
		graphSpacing,
		flowSpacing,
		arcSpacing,
		query,
		globalQuery,
		folders,
			tags,
			metadataFieldSuggestions,
			metadataFieldTypes,
			metadataFieldValueSuggestions,
			filePathSuggestions,
		defaultNodeStyle,
		defaultLinkStyle,
		globalNodeStyleRules,
		nodeStyleOverrides,
		nodeStyleRules,
		globalLinkStyleRules,
		linkStyleOverrides,
		linkStyleRules,
		onFlowEdgeStyle,
		onFlowDirection,
		onArcDirection,
		onFadeDistance,
		onLabelSize,
		onLabelPosition,
			onLabelColor,
				onLabelBackgroundOpacity,
				onLabelDensity,
				onCubeFaceOpacity,
				onForceLabels,
				onEnableForceLayout,
		onGraphSpacing,
		onFlowSpacing,
		onArcSpacing,
		onChange,
		onGlobalChange,
		onDefaultNodeStyle,
		onDefaultLinkStyle,
		onGlobalNodeStyleRulesChange,
		onNodeStyleOverrides,
		onNodeStyleRulesChange,
		onGlobalLinkStyleRulesChange,
		onLinkStyleOverrides,
		onLinkStyleRulesChange,
	}: {
		app: App;
		panel: SettingsPanelMode;
		mode: ViewMode;
		fadeDistance: number;
		labelSize: number;
			labelPosition: LabelPosition;
			labelColor: string;
				labelBackgroundOpacity: number;
				labelDensity: number;
				cubeFaceOpacity: number;
				forceLabels: boolean;
				enableForceLayout: boolean;
		flowEdgeStyle: FlowEdgeStyle;
		flowDirection: FlowDirection;
		arcDirection: ArcDirection;
		graphSpacing: number;
		flowSpacing: number;
		arcSpacing: number;
		query: GraphQuery;
		globalQuery: GraphQuery;
		folders: string[];
			tags: string[];
			metadataFieldSuggestions: string[];
			metadataFieldTypes: Record<string, string>;
			metadataFieldValueSuggestions: Record<string, string[]>;
			filePathSuggestions: string[];
		defaultNodeStyle: Required<DefaultNodeStyle>;
		defaultLinkStyle: Required<DefaultLinkStyle>;
		globalNodeStyleRules: NodeStyleRule[];
		nodeStyleOverrides: DefaultNodeStyle;
		nodeStyleRules: NodeStyleRule[];
		globalLinkStyleRules: LinkStyleRule[];
		linkStyleOverrides: DefaultLinkStyle;
		linkStyleRules: LinkStyleRule[];
		onFlowEdgeStyle: (style: FlowEdgeStyle) => void;
		onFlowDirection: (direction: FlowDirection) => void;
		onArcDirection: (direction: ArcDirection) => void;
		onFadeDistance: (value: number) => void;
		onLabelSize: (value: number) => void;
		onLabelPosition: (position: LabelPosition) => void;
			onLabelColor: (color: string) => void;
				onLabelBackgroundOpacity: (value: number) => void;
				onLabelDensity: (value: number) => void;
				onCubeFaceOpacity: (value: number) => void;
				onForceLabels: (value: boolean) => void;
				onEnableForceLayout: (value: boolean) => void;
		onGraphSpacing: (spacing: number) => void;
		onFlowSpacing: (spacing: number) => void;
		onArcSpacing: (spacing: number) => void;
		onChange: (patch: Partial<Omit<GraphQuery, 'roots'>>) => void;
		onGlobalChange: (patch: Partial<Omit<GraphQuery, 'roots'>>) => void;
		onDefaultNodeStyle: (style: Required<DefaultNodeStyle>) => void;
		onDefaultLinkStyle: (style: Required<DefaultLinkStyle>) => void;
		onGlobalNodeStyleRulesChange: (rules: NodeStyleRule[]) => void;
		onNodeStyleOverrides: (style: DefaultNodeStyle) => void;
		onNodeStyleRulesChange: (rules: NodeStyleRule[]) => void;
		onGlobalLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
		onLinkStyleOverrides: (style: DefaultLinkStyle) => void;
		onLinkStyleRulesChange: (rules: LinkStyleRule[]) => void;
	} = $props();

		const NODE_STYLE_FIELD_OPTIONS = [
		{ value: 'folder', label: 'Folder' },
		{ value: 'tag', label: 'Tag' },
		{ value: 'domain', label: 'Domain' },
		{ value: 'type', label: 'Type' },
		{ value: 'title', label: 'Title' },
		...FILE_FILTER_FIELD_OPTIONS,
	];
	const LINK_STYLE_FIELD_OPTIONS = [
		{ value: 'relation', label: 'Relation' },
		{ value: 'source-field', label: 'Metadata field' },
	];
		const STYLE_FILTER_OPERATOR_OPTIONS = TEXT_FILTER_OPERATOR_OPTIONS;
	const LINE_STYLE_OPTIONS = [
		{ value: 'solid', label: 'Solid' },
		{ value: 'dashed', label: 'Dashed' },
		{ value: 'dotted', label: 'Dotted' },
	];
	const LABEL_POSITION_OPTIONS: Array<{
		value: LabelPosition;
		label: string;
	}> = [
		{ value: 'right', label: 'Right' },
		{ value: 'left', label: 'Left' },
		{ value: 'top', label: 'Top' },
		{ value: 'bottom', label: 'Bottom' },
	];
	const COLOR_COMMIT_DELAY_MS = 180;
	const colorCommitTimers = new Map<string, number>();
	const lastCommittedColors = new Map<string, string>();

	function scheduleColorCommit(
		key: string,
		currentColor: string,
		nextColor: string,
		commit: (color: string) => void,
	): void {
		clearColorCommit(key);
		if (shouldSkipColorCommit(key, currentColor, nextColor)) {
			return;
		}
		colorCommitTimers.set(
			key,
			window.setTimeout(() => {
				colorCommitTimers.delete(key);
				commitColor(key, currentColor, nextColor, commit);
			}, COLOR_COMMIT_DELAY_MS),
		);
	}

	function commitColor(
		key: string,
		currentColor: string,
		nextColor: string,
		commit: (color: string) => void,
	): void {
		clearColorCommit(key);
		if (shouldSkipColorCommit(key, currentColor, nextColor)) {
			return;
		}
		lastCommittedColors.set(key, nextColor);
		commit(nextColor);
	}

	function clearColorCommit(key: string): void {
		const timer = colorCommitTimers.get(key);
		if (timer !== undefined) {
			window.clearTimeout(timer);
			colorCommitTimers.delete(key);
		}
	}

	function shouldSkipColorCommit(
		key: string,
		currentColor: string,
		nextColor: string,
	): boolean {
		if (lastCommittedColors.get(key) !== currentColor) {
			lastCommittedColors.delete(key);
		}
		return (
			nextColor === currentColor ||
			lastCommittedColors.get(key) === nextColor
		);
	}

	function getDefaultLabelColor(): string {
		return cssColorToHex(
			getComputedStyle(document.body)
				.getPropertyValue('--text-normal')
				.trim() || '#000000',
		);
	}

	function cssColorToHex(color: string): string {
		const probe = document.createElement('span');
		probe.style.color = color;
		probe.style.display = 'none';
		document.body.appendChild(probe);
		const normalized = getComputedStyle(probe).color;
		probe.remove();
		const channels = normalized.match(/\d+/gu);
		if (!channels || channels.length < 3) {
			return '#000000';
		}
		return `#${channels
			.slice(0, 3)
			.map((channel) =>
				Math.max(0, Math.min(255, Number(channel)))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')}`;
	}

	onDestroy(() => {
		for (const timer of colorCommitTimers.values()) {
			window.clearTimeout(timer);
		}
		colorCommitTimers.clear();
	});

	function updateFilterRoot(
		scope: 'global' | 'current',
		filterRoot: NodeFilterGroup,
	): void {
		const patch = { filterRoot, hiddenNodeRules: [] };
		if (scope === 'global') {
			onGlobalChange(patch);
		} else {
			onChange(patch);
		}
	}

	function getFilterRoot(scope: 'global' | 'current'): NodeFilterGroup {
		return (
			(scope === 'global' ? globalQuery.filterRoot : query.filterRoot) ?? {
				id: 'root',
				kind: 'group',
				mode: 'all',
				children: [],
			}
		);
	}

	function addFilterCondition(
		scope: 'global' | 'current',
		groupId: string,
	): void {
		updateFilterRoot(
			scope,
			updateFilterGroup(getFilterRoot(scope), groupId, (group) => ({
				...group,
				children: [
					...group.children,
					{
						id: createRuleId(),
						kind: 'condition',
						field: 'file.links',
						operator: 'has-value',
						value: '',
					},
				],
			})),
		);
	}

	function addFilterGroup(scope: 'global' | 'current', groupId: string): void {
		updateFilterRoot(
			scope,
			updateFilterGroup(getFilterRoot(scope), groupId, (group) => ({
				...group,
				children: [
					...group.children,
					{
						id: createRuleId(),
						kind: 'group',
						mode: 'all',
						children: [],
					},
				],
			})),
		);
	}

	function updateFilterItem(
		scope: 'global' | 'current',
		itemId: string,
		patch: Partial<NodeFilterItem>,
	): void {
		updateFilterRoot(
			scope,
			patchFilterItem(getFilterRoot(scope), itemId, patch) as NodeFilterGroup,
		);
	}

	function removeFilterItem(scope: 'global' | 'current', itemId: string): void {
		const root = getFilterRoot(scope);
		if (itemId === root.id) {
			return;
		}
		updateFilterRoot(scope, removeFilterItemFromGroup(root, itemId));
	}

	function updateFilterGroup(
		root: NodeFilterGroup,
		groupId: string,
		update: (group: NodeFilterGroup) => NodeFilterGroup,
	): NodeFilterGroup {
		if (root.id === groupId) {
			return update(root);
		}
		return {
			...root,
			children: root.children.map((child) =>
				child.kind === 'group'
					? updateFilterGroup(child, groupId, update)
					: child,
			),
		};
	}

	function patchFilterItem(
		item: NodeFilterItem,
		itemId: string,
		patch: Partial<NodeFilterItem>,
	): NodeFilterItem {
		if (item.id === itemId) {
			return { ...item, ...patch } as NodeFilterItem;
		}
		if (item.kind === 'group') {
			return {
				...item,
				children: item.children.map((child) =>
					patchFilterItem(child, itemId, patch),
				),
			};
		}
		return item;
	}

	function removeFilterItemFromGroup(
		group: NodeFilterGroup,
		itemId: string,
	): NodeFilterGroup {
		return {
			...group,
			children: group.children
				.filter((child) => child.id !== itemId)
				.map((child) =>
					child.kind === 'group'
						? removeFilterItemFromGroup(child, itemId)
						: child,
				),
		};
	}

		function getFilterFieldOptions() {
			return resolveFilterFieldOptions(
				metadataFieldSuggestions,
				metadataFieldTypes,
			);
		}

		function getFilterOperatorOptions(field: NodeFilterField) {
			return resolveFilterOperatorOptions(field, metadataFieldTypes);
		}

		function getDefaultFilterOperator(field: NodeFilterField): NodeFilterOperator {
			return resolveDefaultFilterOperator(field, metadataFieldTypes);
		}

		function getFilterFieldType(field: NodeFilterField): string {
			return resolveFilterFieldType(field, metadataFieldTypes);
		}

	function addNodeRule(scope: 'global' | 'current'): void {
		updateNodeRules(scope, [
			...getNodeRules(scope),
			{
				id: createRuleId(),
				field: 'metadata-field',
				operator: 'has-value',
				value: '',
				color: '#7c6ff0',
				size: 7,
			},
		]);
	}

	function updateNodeRule(
		scope: 'global' | 'current',
		id: string,
		patch: Partial<NodeStyleRule>,
	): void {
		updateNodeRules(
			scope,
			getNodeRules(scope).map((rule) =>
				rule.id === id ? { ...rule, ...patch } : rule,
			),
		);
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

	function addLinkRule(scope: 'global' | 'current'): void {
		updateLinkRules(scope, [
			...getLinkRules(scope),
			{
				id: createRuleId(),
				field: 'source-field',
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
		scope: 'global' | 'current',
		id: string,
		patch: Partial<LinkStyleRule>,
	): void {
		updateLinkRules(
			scope,
			getLinkRules(scope).map((rule) =>
				rule.id === id ? { ...rule, ...patch } : rule,
			),
		);
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

	type StyleRuleKind = 'node' | 'link';
	type StyleRuleScope = 'global' | 'current';

	function moveStyleRule(
		kind: StyleRuleKind,
		scope: StyleRuleScope,
		id: string,
		direction: -1 | 1,
	): void {
		if (kind === 'node') {
			updateNodeRules(scope, moveRule(getNodeRules(scope), id, direction));
		} else {
			updateLinkRules(scope, moveRule(getLinkRules(scope), id, direction));
		}
	}

	function canMoveRule<T extends { id: string }>(
		rules: T[],
		id: string,
		direction: -1 | 1,
	): boolean {
		const index = rules.findIndex((rule) => rule.id === id);
		const targetIndex = index + direction;
		return index >= 0 && targetIndex >= 0 && targetIndex < rules.length;
	}

	function moveRule<T extends { id: string }>(
		rules: T[],
		id: string,
		direction: -1 | 1,
	): T[] {
		const index = rules.findIndex((rule) => rule.id === id);
		const targetIndex = index + direction;
		if (index < 0 || targetIndex < 0 || targetIndex >= rules.length) {
			return rules;
		}
		const next = [...rules];
		const current = next[index];
		const target = next[targetIndex];
		if (!current || !target) {
			return rules;
		}
		next[index] = target;
		next[targetIndex] = current;
		return next;
	}

	function updateDefaultNodeStyle(patch: Partial<DefaultNodeStyle>): void {
		onDefaultNodeStyle({ ...defaultNodeStyle, ...patch });
	}

	function updateDefaultLinkStyle(patch: Partial<DefaultLinkStyle>): void {
		onDefaultLinkStyle({ ...defaultLinkStyle, ...patch });
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

	function updateLinkOverride(patch: DefaultLinkStyle): void {
		onLinkStyleOverrides({ ...linkStyleOverrides, ...patch });
	}

	function addLinkOverride(): void {
		onLinkStyleOverrides({ ...defaultLinkStyle });
	}

	function clearLinkOverride(): void {
		onLinkStyleOverrides({});
	}

	function activeNodeStyleValue(field: keyof DefaultNodeStyle): string | number {
		return nodeStyleOverrides[field] ?? defaultNodeStyle[field];
	}

	function activeLinkStyleValue(
		field: keyof DefaultLinkStyle,
	): string | number | boolean {
		return linkStyleOverrides[field] ?? defaultLinkStyle[field];
	}

	function activeNodeColor(): string {
		return String(activeNodeStyleValue('color'));
	}

	function activeNodeSize(): number {
		return Number(activeNodeStyleValue('size'));
	}

	function activeLinkColor(): string {
		return String(activeLinkStyleValue('color'));
	}

	function activeLinkSize(): number {
		return Number(activeLinkStyleValue('size'));
	}

	function activeLinkLineStyle(): LinkLineStyle {
		return activeLinkStyleValue('lineStyle') as LinkLineStyle;
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

	function hasNodeOverride(): boolean {
		return Object.keys(nodeStyleOverrides).length > 0;
	}

	function hasLinkOverride(): boolean {
		return Object.keys(linkStyleOverrides).length > 0;
	}

	function removeNodeRule(scope: 'global' | 'current', id: string): void {
		updateNodeRules(
			scope,
			getNodeRules(scope).filter((rule) => rule.id !== id),
		);
	}

	function removeLinkRule(scope: 'global' | 'current', id: string): void {
		updateLinkRules(
			scope,
			getLinkRules(scope).filter((rule) => rule.id !== id),
		);
	}

	function shouldShowFilterValue(
		operator: NodeFilterOperator | undefined,
	): boolean {
		return operator !== 'has-value' && operator !== 'empty';
	}

	function createRuleId(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	function commitSpacing(spacing: number): void {
		if (mode === 'graph' || mode === 'graph-3d' || mode === 'cube') onGraphSpacing(spacing);
		if (mode === 'flow') onFlowSpacing(spacing);
		if (mode === 'arc') onArcSpacing(spacing);
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

<aside class="knowledge-workspace-filters">
	{#if panel === 'graph'}
		<section>
			<header><h3>Graph settings</h3></header>
			<label class="knowledge-workspace-rule-label">
				<span>Max nodes</span>
				<ObsidianTextInput
					type="number"
					min="1"
					max="9999"
					step="1"
					value={query.maxNodes}
					onChange={(value) => {
						const parsed = Number.parseInt(value, 10);
						if (Number.isFinite(parsed) && parsed > 0) {
							onChange({ maxNodes: parsed });
						}
					}}
				/>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Show isolated nodes</span>
				<ObsidianToggle
					value={query.showIsolatedNodes}
					onChange={(value) => onChange({ showIsolatedNodes: value })}
				/>
			</label>
			{#if mode === 'graph' || mode === 'graph-3d' || mode === 'cube'}
				<label class="knowledge-workspace-rule-label">
					<span>Force layout</span>
					<ObsidianToggle
						value={enableForceLayout}
						onChange={onEnableForceLayout}
					/>
				</label>
			{/if}
				{#if mode !== 'hierarchical-edge-bundling'}
					<label class="knowledge-workspace-rule-label">
						<span>Spacing</span>
						<div class="knowledge-workspace-slider-value">
							<ObsidianSlider
								min={0.25}
								max={4}
								step={0.25}
								value={mode === 'graph' || mode === 'graph-3d' || mode === 'cube'
									? graphSpacing
									: mode === 'flow'
										? flowSpacing
										: arcSpacing}
								format={(value) =>
									value.toFixed(2).replace(/\.?0+$/u, '')}
								onChange={commitSpacing}
								onCommit={commitSpacing}
							/>
							<span
								>{(mode === 'graph' || mode === 'graph-3d' || mode === 'cube'
									? graphSpacing
									: mode === 'flow'
										? flowSpacing
										: arcSpacing
								)
									.toFixed(2)
									.replace(/\.?0+$/u, '')}</span
							>
						</div>
					</label>
				{/if}
				<label class="knowledge-workspace-rule-label">
					<span>Fade distance</span>
					<div class="knowledge-workspace-slider-value">
						<ObsidianSlider
							value={fadeDistance}
							min={0.25}
							max={4}
							step={0.05}
							format={(value) =>
								value.toFixed(2).replace(/\.?0+$/u, '')}
							onChange={onFadeDistance}
							onCommit={onFadeDistance}
						/>
						<span>{fadeDistance.toFixed(2).replace(/\.?0+$/u, '')}</span>
					</div>
				</label>
					<label class="knowledge-workspace-rule-label">
						<span>Label density</span>
						<div class="knowledge-workspace-slider-value">
						<ObsidianSlider
							value={labelDensity}
							min={0}
							max={1}
							step={0.05}
							format={(value) => `${Math.round(value * 100)}%`}
							onChange={onLabelDensity}
							onCommit={onLabelDensity}
						/>
							<span>{Math.round(labelDensity * 100)}%</span>
						</div>
					</label>
					{#if mode === 'cube'}
						<label class="knowledge-workspace-rule-label">
							<span>Face opacity</span>
							<div class="knowledge-workspace-slider-value">
								<ObsidianSlider
									value={cubeFaceOpacity}
									min={0.05}
									max={1}
									step={0.05}
									format={(value) => `${Math.round(value * 100)}%`}
									onChange={onCubeFaceOpacity}
									onCommit={onCubeFaceOpacity}
								/>
								<span>{Math.round(cubeFaceOpacity * 100)}%</span>
							</div>
						</label>
					{/if}
					<label class="knowledge-workspace-rule-label">
						<span>Always show labels</span>
					<ObsidianToggle value={forceLabels} onChange={onForceLabels} />
				</label>
				{#if mode === 'flow'}
				<div class="knowledge-workspace-rule-label segmented">
					<span>Direction</span>
					<div class="knowledge-workspace-segmented">
						{#each ['LR', 'RL', 'TD', 'DT'] as direction}
							<ObsidianButton
								active={flowDirection === direction}
								text={direction}
								onClick={() =>
									onFlowDirection(direction as FlowDirection)}
							/>
						{/each}
					</div>
				</div>
				<div class="knowledge-workspace-rule-label segmented">
					<span>Line</span>
					<div class="knowledge-workspace-segmented">
						<ObsidianButton
							active={flowEdgeStyle === 'straight'}
							text="Straight"
							onClick={() => onFlowEdgeStyle('straight')}
						/>
						<ObsidianButton
							active={flowEdgeStyle === 'orthogonal'}
							text="Orthogonal"
							onClick={() => onFlowEdgeStyle('orthogonal')}
						/>
					</div>
				</div>
			{:else if mode === 'arc'}
				<label class="knowledge-workspace-rule-label">
					<span>Direction</span>
					<ObsidianDropdown
						value={arcDirection}
						options={[
							{ value: 'right', label: 'Right' },
							{ value: 'left', label: 'Left' },
							{ value: 'up', label: 'Up' },
							{ value: 'down', label: 'Down' },
						]}
						onChange={(value) =>
							onArcDirection(value as ArcDirection)}
					/>
				</label>
			{/if}
		</section>
	{:else if panel === 'text-style'}
		<section>
			<header><h3>Text style</h3></header>
			<label class="knowledge-workspace-rule-label">
				<span>Font size</span>
				<div class="knowledge-workspace-slider-value">
					<ObsidianSlider
						value={labelSize}
						min={8}
						max={28}
						step={0.5}
						format={(value) => value.toFixed(1)}
						onChange={onLabelSize}
						onCommit={onLabelSize}
					/>
					<span>{labelSize.toFixed(1)}</span>
				</div>
			</label>
			<label class="knowledge-workspace-rule-label">
				<span>Font color</span>
				<input
					type="color"
					value={labelColor || getDefaultLabelColor()}
					oninput={(event) =>
						scheduleColorCommit(
							'text:label-color',
							labelColor || getDefaultLabelColor(),
							event.currentTarget.value,
							onLabelColor,
						)}
					onchange={(event) =>
						commitColor(
							'text:label-color',
							labelColor || getDefaultLabelColor(),
							event.currentTarget.value,
							onLabelColor,
						)}
				/>
			</label>
				{#if mode !== 'hierarchical-edge-bundling'}
					<div class="knowledge-workspace-rule-label segmented">
						<span>Text position</span>
						<div class="knowledge-workspace-segmented">
							{#each LABEL_POSITION_OPTIONS as option}
								<ObsidianButton
									active={labelPosition === option.value}
									text={option.label}
									onClick={() => onLabelPosition(option.value)}
								/>
							{/each}
						</div>
					</div>
				{/if}
				<label class="knowledge-workspace-rule-label">
					<span>Text background</span>
					<div class="knowledge-workspace-slider-value">
						<ObsidianSlider
							value={labelBackgroundOpacity}
							min={0}
							max={1}
							step={0.05}
							format={(value) => `${Math.round(value * 100)}%`}
							onChange={onLabelBackgroundOpacity}
							onCommit={onLabelBackgroundOpacity}
						/>
						<span>{Math.round(labelBackgroundOpacity * 100)}%</span>
					</div>
				</label>
		</section>
	{:else if panel === 'filters'}
		{#each ['global', 'current'] as scope}
			<section class="knowledge-workspace-filter-scope">
				<header>
					<h3>
						{scope === 'global' ? 'All views' : 'This view'}
					</h3>
				</header>
				<FilterGroup
					{app}
					group={getFilterRoot(scope as 'global' | 'current')}
					root={true}
					fieldOptions={getFilterFieldOptions()}
					getOperatorOptions={getFilterOperatorOptions}
					getDefaultOperator={getDefaultFilterOperator}
					getFieldType={getFilterFieldType}
					groupModeOptions={getFilterGroupModeOptions()}
					getValueOptions={getNodeValueOptions}
					onAddCondition={(groupId) =>
						addFilterCondition(scope as 'global' | 'current', groupId)}
					onAddGroup={(groupId) =>
						addFilterGroup(scope as 'global' | 'current', groupId)}
					onUpdate={(id, patch) =>
						updateFilterItem(scope as 'global' | 'current', id, patch)}
					onRemove={(id) =>
						removeFilterItem(scope as 'global' | 'current', id)}
				/>
			</section>
		{/each}
		{:else if panel === 'note-style'}
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
						<h3>{scope === 'global' ? 'Global note rules' : 'Chart note rules'}</h3>
					<ObsidianButton
						class="knowledge-workspace-add-rule-button"
						ariaLabel="Add note style rule"
						icon="plus"
						onClick={() =>
							addNodeRule(scope as 'global' | 'current')}
					/>
				</header>
				{#each getNodeRules(scope as 'global' | 'current') as rule (rule.id)}
					<div class="knowledge-workspace-rule">
						<div
							class="knowledge-workspace-rule-row style-condition"
						>
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
											moveStyleRule(
												'node',
												scope as StyleRuleScope,
												rule.id,
												-1,
											)}
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
											moveStyleRule(
												'node',
												scope as StyleRuleScope,
												rule.id,
												1,
											)}
									/>
								</div>
								<ObsidianDropdown
									value={rule.field}
									options={NODE_STYLE_FIELD_OPTIONS}
								onChange={(value) =>
									updateNodeRule(
										scope as 'global' | 'current',
										rule.id,
										{
											field: value as NodeStyleField,
										},
									)}
							/>
									<ObsidianDropdown
									value={rule.operator ?? 'is'}
									options={STYLE_FILTER_OPERATOR_OPTIONS}
									onChange={(value) =>
										updateNodeRule(
											scope as 'global' | 'current',
											rule.id,
											{
												operator:
													value as NodeFilterOperator,
											},
										)}
								/>
								{#if shouldShowFilterValue(rule.operator) && getNodeValueOptions(rule.field).length > 0}
									<ObsidianSuggestInput
										{app}
										type="text"
										placeholder="Value"
										value={rule.value}
										options={getNodeValueOptions(
											rule.field,
										)}
										onInput={(value) =>
											updateNodeRule(
												scope as 'global' | 'current',
												rule.id,
												{
													value,
												},
											)}
										onSelect={(option) =>
											updateNodeRule(
												scope as 'global' | 'current',
												rule.id,
												{
													value: option.value,
												},
											)}
									/>
								{:else}
									<ObsidianTextInput
										type="text"
										placeholder={shouldShowFilterValue(
											rule.operator,
										)
											? 'Value'
											: ''}
										disabled={!shouldShowFilterValue(
											rule.operator,
										)}
										value={rule.value}
										onInput={(value) =>
											updateNodeRule(
												scope as 'global' | 'current',
												rule.id,
												{
													value,
												},
											)}
									/>
								{/if}
								<ObsidianButton
								class="knowledge-workspace-remove-rule-button"
								ariaLabel="Remove note style rule"
									icon="trash-2"
								onClick={() =>
									removeNodeRule(
										scope as 'global' | 'current',
										rule.id,
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
										scheduleColorCommit(
											`node:${scope}:${rule.id}`,
											rule.color,
											event.currentTarget.value,
											(color) =>
												updateNodeRule(
													scope as
														| 'global'
														| 'current',
													rule.id,
													{
														color,
													},
												),
										)}
									onchange={(event) =>
										commitColor(
											`node:${scope}:${rule.id}`,
											rule.color,
											event.currentTarget.value,
											(color) =>
												updateNodeRule(
													scope as
														| 'global'
														| 'current',
													rule.id,
													{
														color,
													},
												),
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
											updateNodeRule(
												scope as 'global' | 'current',
												rule.id,
												{
													size: value,
												},
											)}
									/>
									<span>{rule.size.toFixed(1)}</span>
								</div>
							</label>
						</div>
					</div>
				{/each}
			</section>
		{/each}
		{:else}
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
									onChange={(showLabel) =>
										updateLinkOverride({ showLabel })}
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
						<h3>{scope === 'global' ? 'Global link rules' : 'Chart link rules'}</h3>
					<ObsidianButton
						class="knowledge-workspace-add-rule-button"
						ariaLabel="Add link style rule"
						icon="plus"
						onClick={() =>
							addLinkRule(scope as 'global' | 'current')}
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
											moveStyleRule(
												'link',
												scope as StyleRuleScope,
												rule.id,
												-1,
											)}
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
											moveStyleRule(
												'link',
												scope as StyleRuleScope,
												rule.id,
												1,
											)}
									/>
								</div>
								<ObsidianDropdown
									value={rule.field}
									options={LINK_STYLE_FIELD_OPTIONS}
								onChange={(value) =>
									updateLinkRule(
										scope as 'global' | 'current',
										rule.id,
										{
											field: value as LinkStyleField,
										},
									)}
							/>
								<ObsidianTextInput
									type="text"
									placeholder="Metadata value"
								value={rule.value}
								onInput={(value) =>
									updateLinkRule(
										scope as 'global' | 'current',
										rule.id,
										{
											value,
										},
									)}
							/>
							<ObsidianButton
									class="knowledge-workspace-remove-rule-button"
									ariaLabel="Remove link style rule"
									icon="trash-2"
								onClick={() =>
									removeLinkRule(
										scope as 'global' | 'current',
										rule.id,
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
										scheduleColorCommit(
											`link:${scope}:${rule.id}`,
											rule.color,
											event.currentTarget.value,
											(color) =>
												updateLinkRule(
													scope as
														| 'global'
														| 'current',
													rule.id,
													{
														color,
													},
												),
										)}
									onchange={(event) =>
										commitColor(
											`link:${scope}:${rule.id}`,
											rule.color,
											event.currentTarget.value,
											(color) =>
												updateLinkRule(
													scope as
														| 'global'
														| 'current',
													rule.id,
													{
														color,
													},
												),
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
											updateLinkRule(
												scope as 'global' | 'current',
												rule.id,
												{
													size: value,
												},
											)}
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
											updateLinkRule(
												scope as 'global' | 'current',
												rule.id,
												{
													lineStyle:
														option.value as LinkLineStyle,
												},
											)}
									/>
								{/each}
							</div>
						</div>
						<div
							class="knowledge-workspace-rule-row link-line-label"
						>
							<label class="knowledge-workspace-rule-label">
								<span>Label</span>
								<ObsidianTextInput
									type="text"
									placeholder="Optional label"
									value={rule.label}
									onInput={(value) =>
										updateLinkRule(
											scope as 'global' | 'current',
											rule.id,
											{
												label: value,
											},
										)}
								/>
							</label>
						</div>
						<div class="knowledge-workspace-toggle-row">
							<label class="checkbox">
								<ObsidianToggle
									value={rule.showLabel}
									onChange={(value) =>
										updateLinkRule(
											scope as 'global' | 'current',
											rule.id,
											{
												showLabel: value,
											},
										)}
								/>
								<span>Show label</span>
							</label>
							<label class="checkbox">
								<ObsidianToggle
									value={rule.hidden}
									onChange={(value) =>
										updateLinkRule(
											scope as 'global' | 'current',
											rule.id,
											{
												hidden: value,
											},
										)}
								/>
								<span>Hidden</span>
							</label>
						</div>
					</div>
				{/each}
			</section>
		{/each}
	{/if}
</aside>
