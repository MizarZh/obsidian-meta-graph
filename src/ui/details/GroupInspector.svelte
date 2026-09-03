<script lang="ts">
	import type {
		ChartGroupDefinition,
		ChartGroupingConfig,
		KnowledgeNode,
		ManualLayoutConfig,
		NodeFilterItem,
		ViewMode,
	} from '../../core/types';
	import { resolveChartGroupOwnership } from '../../query/group-ownership';
	import { resolveGroupCapabilities } from '../../workspace/groups/group-policy';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import { obsidianTooltip } from '../obsidian/obsidian-tooltip';

	let {
		group,
		grouping,
		manualLayout,
		nodes,
		mode,
		readOnly = false,
		onSelectNode,
		onOpenNote,
		onFocusNode,
		onSetNodeGroup,
		onEditGroup,
	}: {
		group: ChartGroupDefinition;
		grouping: ChartGroupingConfig;
		manualLayout: ManualLayoutConfig;
		nodes: KnowledgeNode[];
		mode: ViewMode;
		readOnly?: boolean;
		onSelectNode: (nodeId: string) => void;
		onOpenNote: (nodeId: string) => void;
		onFocusNode: (nodeId: string) => void;
		onSetNodeGroup: (nodeId: string, groupId?: string | null) => void;
		onEditGroup: (event: MouseEvent) => void;
	} = $props();
	let memberSearch = $state('');

	const capabilities = $derived(resolveGroupCapabilities(mode, group));
	const ownership = $derived(resolveChartGroupOwnership(nodes, grouping));
	const members = $derived.by(() => {
		const memberIds = new Set(ownership.membersByGroup.get(group.id) ?? []);
		return nodes
			.filter((node) => memberIds.has(node.id))
			.sort((left, right) =>
				left.title.localeCompare(right.title, undefined, {
					sensitivity: 'base',
				}),
			);
	});
	const conflicts = $derived(
		ownership.conflicts.filter((conflict) =>
			conflict.groupIds.includes(group.id),
		),
	);
	const filteredMembers = $derived.by(() => {
		const query = memberSearch.trim().toLocaleLowerCase();
		return query
			? members.filter((member) =>
					`${member.title} ${member.path}`
						.toLocaleLowerCase()
						.includes(query),
				)
			: members;
	});
	const priority = $derived(
		Math.max(
			0,
			grouping.groups.findIndex((candidate) => candidate.id === group.id),
		) + 1,
	);
	const frame = $derived(manualLayout.groupFrames?.[group.id]);
	const ruleLines = $derived(
		group.rule ? summarizeRuleItems(group.rule.children) : [],
	);

	function membershipLabel(): string {
		if (capabilities.membership === 'system') return 'System';
		return capabilities.membership === 'rule'
			? 'Rule-based'
			: 'Manual assignment';
	}

	function spatialLabel(): string {
		return {
			'automatic-region': 'Automatic region',
			'fixed-frame': 'Fixed frame',
			'layout-region': 'Layout region',
			surface: 'Surface',
			none: 'None',
		}[capabilities.spatial];
	}

	function memberSource(nodeId: string): string {
		if (capabilities.membership === 'system') return 'System';
		return ownership.byNode.get(nodeId)?.source === 'override'
			? 'Manual'
			: 'Rule';
	}

	function summarizeRuleItems(items: NodeFilterItem[], depth = 0): string[] {
		return items.flatMap((item) => {
			if (item.kind === 'condition') {
				return [
					`${'  '.repeat(depth)}${item.field} ${item.operator ?? 'is'} ${item.value}`,
				];
			}
			return [
				`${'  '.repeat(depth)}Match ${item.mode}`,
				...summarizeRuleItems(item.children, depth + 1),
			];
		});
	}
</script>

<section
	class="knowledge-workspace-inspector knowledge-workspace-group-inspector"
	style:--knowledge-workspace-detail-color={group.color}
>
	<header class="knowledge-workspace-inspector-header">
		<span class="knowledge-workspace-detail-color" aria-hidden="true"
		></span>
		<div class="knowledge-workspace-detail-title">
			<strong>{group.name}</strong>
			<span>{members.length} nodes</span>
		</div>
		<div class="knowledge-workspace-inspector-header-actions">
			{#if capabilities.canEditIdentity || capabilities.canEditAppearance}
				<ObsidianButton
					icon="settings-2"
					ariaLabel={`Edit ${group.name}`}
					tooltip="Edit group"
					disabled={readOnly}
					onClick={onEditGroup}
				/>
			{/if}
		</div>
	</header>
	<div class="knowledge-workspace-inspector-body">
		<div class="knowledge-workspace-detail-badges">
			<span class="knowledge-workspace-detail-badge"
				>{membershipLabel()}</span
			>
			<span class="knowledge-workspace-detail-badge"
				>{spatialLabel()}</span
			>
			{#if capabilities.membership === 'system'}
				<span class="knowledge-workspace-detail-badge muted"
					>Locked</span
				>
			{/if}
		</div>

		<section class="knowledge-workspace-detail-section">
			<header><h4>Overview</h4></header>
			<dl class="knowledge-workspace-detail-grid">
				<dt>Membership</dt>
				<dd>{membershipLabel()}</dd>
				<dt>Region</dt>
				<dd>{spatialLabel()}</dd>
				<dt>Members</dt>
				<dd>{members.length}</dd>
				<dt>Priority</dt>
				<dd>{priority} of {grouping.groups.length}</dd>
				<dt>Shape</dt>
				<dd>{group.shape ?? 'auto'}</dd>
				<dt>Padding</dt>
				<dd>{group.padding}</dd>
			</dl>
			{#if frame}
				<div class="knowledge-workspace-group-frame-summary">
					<strong>Frame</strong>
					<span>X {frame.x}</span><span>Y {frame.y}</span>
					<span>W {frame.width}</span><span>H {frame.height}</span>
				</div>
			{/if}
		</section>

		<section class="knowledge-workspace-detail-section">
			<header><h4>Membership</h4></header>
			{#if capabilities.membership === 'rule'}
				<p class="knowledge-workspace-detail-caption">
					Match {group.rule?.mode ?? 'all'}:
				</p>
				{#if ruleLines.length > 0}
					<ul class="knowledge-workspace-group-rule-summary">
						{#each ruleLines as line}
							<li>{line}</li>
						{/each}
					</ul>
				{:else}
					<p class="knowledge-workspace-detail-empty">
						No rule conditions.
					</p>
				{/if}
			{:else if capabilities.membership === 'system'}
				<p class="knowledge-workspace-detail-caption">
					Membership is managed by the Cube layout. Nodes may be moved
					between faces.
				</p>
			{:else}
				<p class="knowledge-workspace-detail-caption">
					Nodes are assigned explicitly.
				</p>
			{/if}
		</section>

		<section class="knowledge-workspace-detail-section">
			<header>
				<h4>Members</h4>
				<span>{members.length}</span>
			</header>
			{#if members.length > 0}
				<ObsidianTextInput
					type="search"
					placeholder="Search members"
					ariaLabel="Search group members"
					value={memberSearch}
					onInput={(value) => (memberSearch = value)}
				/>
			{/if}
			{#if members.length === 0}
				<p class="knowledge-workspace-detail-empty">
					No visible members.
				</p>
			{:else if filteredMembers.length === 0}
				<p class="knowledge-workspace-detail-empty">
					No matching members.
				</p>
			{:else}
				<div class="knowledge-workspace-group-member-list">
					{#each filteredMembers as member (member.id)}
						<div class="knowledge-workspace-group-member">
							<button
								type="button"
								class="knowledge-workspace-group-member-main"
								onclick={() => onSelectNode(member.id)}
							>
								<span use:obsidianTooltip={member.title}
									>{member.title}</span
								>
								<small>{memberSource(member.id)}</small>
							</button>
							<div
								class="knowledge-workspace-group-member-actions"
							>
								<ObsidianButton
									icon="crosshair"
									ariaLabel={`Focus ${member.title}`}
									tooltip="Focus"
									onClick={() => onFocusNode(member.id)}
								/>
								<ObsidianButton
									icon="file-text"
									ariaLabel={`Open ${member.title}`}
									tooltip="Open"
									onClick={() => onOpenNote(member.id)}
								/>
								{#if capabilities.membership !== 'system' && ownership.byNode.get(member.id)?.source === 'override'}
									<ObsidianButton
										icon="rotate-ccw"
										ariaLabel={`Return ${member.title} to automatic membership`}
										tooltip="Return to automatic"
										disabled={readOnly}
										onClick={() =>
											onSetNodeGroup(
												member.id,
												undefined,
											)}
									/>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		{#if conflicts.length > 0}
			<section
				class="knowledge-workspace-detail-section knowledge-workspace-group-conflicts"
			>
				<header>
					<h4>Membership conflicts</h4>
					<span>{conflicts.length}</span>
				</header>
				{#each conflicts as conflict (conflict.nodeId)}
					<div>
						<strong
							use:obsidianTooltip={nodes.find(
								(node) => node.id === conflict.nodeId,
							)?.title ?? conflict.nodeId}
							>{nodes.find((node) => node.id === conflict.nodeId)
								?.title ?? conflict.nodeId}</strong
						>
						<span>Matches {conflict.groupIds.length} groups</span>
					</div>
				{/each}
			</section>
		{/if}
	</div>
</section>
