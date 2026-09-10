import {
	reorderRuleAtTarget,
	type StyleRuleScope,
} from '@/ui/filter/filter-style-rules';

export function planStyleRuleDrop<T extends { id: string }>(
	global: T[],
	current: T[],
	payload: string,
	targetScope: StyleRuleScope,
	targetId?: string,
	after = true,
) {
	const separator = payload.indexOf(':');
	const sourceScope = payload.slice(0, separator);
	const id = payload.slice(separator + 1);
	if (sourceScope !== 'global' && sourceScope !== 'current') return;
	const source = sourceScope === 'global' ? global : current;
	const target = targetScope === 'global' ? global : current;
	const rule = source.find((item) => item.id === id);
	if (
		!rule ||
		(sourceScope !== targetScope && target.some((item) => item.id === id))
	)
		return;
	if (targetId && !target.some((item) => item.id === targetId)) return;
	const rules = sourceScope === targetScope ? target : [...target, rule];
	const ordered = targetId
		? reorderRuleAtTarget(rules, id, targetId, after)
		: [...rules.filter((item) => item.id !== id), rule];
	return {
		id,
		sourceScope,
		rules: ordered,
		transferred: sourceScope !== targetScope,
	};
}

export function styleRuleDropZone(
	node: HTMLElement,
	options: { key: string; onDrop: (payload: string) => void },
) {
	const mime = () => `application/x-meta-graph-style-${options.key}`;
	const clear = () => node.classList.remove('style-rule-drop-target');
	function over(event: DragEvent) {
		if (!event.dataTransfer?.types.includes(mime())) return;
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'move';
		node.classList.add('style-rule-drop-target');
	}
	function drop(event: DragEvent) {
		if (!event.dataTransfer?.types.includes(mime())) return;
		event.preventDefault();
		event.stopPropagation();
		clear();
		options.onDrop(event.dataTransfer.getData(mime()));
	}
	function leave(event: DragEvent) {
		if (!node.contains(event.relatedTarget as Node | null)) clear();
	}
	node.addEventListener('dragover', over);
	node.addEventListener('drop', drop);
	node.addEventListener('dragleave', leave);
	node.ownerDocument.addEventListener('dragend', clear);
	return {
		update(next: typeof options) {
			options = next;
		},
		destroy() {
			node.removeEventListener('dragover', over);
			node.removeEventListener('drop', drop);
			node.removeEventListener('dragleave', leave);
			node.ownerDocument.removeEventListener('dragend', clear);
		},
	};
}
