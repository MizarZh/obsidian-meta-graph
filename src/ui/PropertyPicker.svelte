<script lang="ts">
	import { setIcon, type IconName } from 'obsidian';
	import { onMount } from 'svelte';

	export interface PropertyPickerOption {
		value: string;
		label: string;
		detail: string;
		icon: IconName;
	}

	let {
		value,
		options,
		onSelect,
	}: {
		value: string;
		options: PropertyPickerOption[];
		onSelect: (value: string) => void;
	} = $props();

	let open = $state(false);
	let search = $state('');
	let triggerEl = $state<HTMLButtonElement | undefined>(undefined);
	let menuEl = $state<HTMLDivElement | undefined>(undefined);
	let menuStyle = $state('');
	const selected = $derived(
		options.find((option) => option.value === value) ?? {
			value,
			label: value,
			detail: value,
			icon: 'braces' as IconName,
		},
	);
	const filteredOptions = $derived(
		options.filter((option) => {
			const normalized = search.trim().toLocaleLowerCase();
			if (!normalized) {
				return true;
			}
			return [option.label, option.detail, option.value]
				.join(' ')
				.toLocaleLowerCase()
				.includes(normalized);
		}),
	);

	function obsidianIcon(node: HTMLElement, icon: IconName) {
		setIcon(node, icon);
		return {
			update(nextIcon: IconName) {
				setIcon(node, nextIcon);
			},
		};
	}

	function choose(nextValue: string): void {
		onSelect(nextValue);
		close();
	}

	function close(): void {
		open = false;
		search = '';
	}

	function updateMenuPosition(): void {
		if (!triggerEl) {
			return;
		}
		const rect = triggerEl.getBoundingClientRect();
		const width = rect.width;
		const left = rect.left;
		const menuHeight = Math.min(320, 48 + filteredOptions.length * 39);
		const bottomTop = rect.bottom;
		const top =
			bottomTop + menuHeight <= window.innerHeight - 8
				? bottomTop
				: Math.max(8, rect.top - menuHeight);
		menuStyle = `top: ${top}px; left: ${left}px; width: ${width}px;`;
	}

	function toggleOpen(): void {
		open = !open;
		if (open) {
			updateMenuPosition();
		}
	}

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		updateMenuPosition();
		return {
			destroy() {
				node.remove();
			},
		};
	}

	onMount(() => {
		const reposition = () => {
			if (open) {
				updateMenuPosition();
			}
		};
		const closeOnOutsidePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (
				target instanceof Node &&
				(triggerEl?.contains(target) || menuEl?.contains(target))
			) {
				return;
			}
			close();
		};
		const closeOnScroll = (event: Event) => {
			const target = event.target;
			if (
				target instanceof Node &&
				(triggerEl?.contains(target) || menuEl?.contains(target))
			) {
				return;
			}
			if (open) {
				close();
			}
		};
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', closeOnScroll, true);
		window.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
		return () => {
			window.removeEventListener('resize', reposition);
			window.removeEventListener('scroll', closeOnScroll, true);
			window.removeEventListener(
				'pointerdown',
				closeOnOutsidePointerDown,
				true,
			);
		};
	});
</script>

<div class="knowledge-workspace-property-picker">
	<button
		type="button"
		bind:this={triggerEl}
		class="knowledge-workspace-property-trigger"
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={toggleOpen}
	>
		<span
			class="knowledge-workspace-property-icon"
			use:obsidianIcon={selected.icon}
			aria-hidden="true"
		></span>
		<span class="knowledge-workspace-property-text">
			<span>{selected.label}</span>
			<small>{selected.detail}</small>
		</span>
		<span class="knowledge-workspace-view-caret" aria-hidden="true"></span>
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="knowledge-workspace-property-backdrop"
			onpointerdown={close}
			oncontextmenu={(event) => {
				event.preventDefault();
				close();
			}}
		></div>
		<div
			bind:this={menuEl}
			use:portal
			class="knowledge-workspace-property-menu"
			role="menu"
			style={menuStyle}
		>
			<label class="knowledge-workspace-property-search">
				<input
					type="search"
					placeholder="Search properties..."
					value={search}
					oninput={(event) => {
						search = event.currentTarget.value;
					}}
					onpointerdown={(event) => {
						event.stopPropagation();
					}}
					onkeydown={(event) => {
						event.stopPropagation();
					}}
				/>
			</label>
			<div class="knowledge-workspace-property-list">
				{#each filteredOptions as option (option.value)}
					<button
						type="button"
						role="menuitem"
						class:active={option.value === value}
						class="knowledge-workspace-property-option"
						onclick={() => choose(option.value)}
					>
						<span
							class="knowledge-workspace-property-icon"
							use:obsidianIcon={option.icon}
							aria-hidden="true"
						></span>
						<span class="knowledge-workspace-property-text">
							<span>{option.label}</span>
							<small>{option.detail}</small>
						</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
