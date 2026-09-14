import type { ChartGroupDefinition } from '@/core/types';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import { scaleLayoutGroupPadding } from '@/layouts/group-geometry';

interface GroupDisk {
	id: string;
	nodes: string[];
	x: number;
	y: number;
	radius: number;
}

/** Final constraint pass: spacing refinement must not undo Group separation.
 * Enclose member bounds plus nominal frame clearance in a conservative disk;
 * translate whole Groups so their internal spacing stays intact.
 */
export function separateStressGroups(
	graph: RuntimeGraph,
	groupByNode: ReadonlyMap<string, string>,
	definitions: readonly ChartGroupDefinition[],
	unit: number,
): void {
	if (groupByNode.size === 0) return;
	const members = new Map<string, string[]>();
	for (const [id, group] of [...groupByNode].sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		if (
			!graph.hasNode(id) ||
			graph.getNodeAttribute(id, 'isBend') ||
			graph.getNodeAttribute(id, 'hidden')
		)
			continue;
		const nodes = members.get(group) ?? [];
		nodes.push(id);
		members.set(group, nodes);
	}
	const padding = new Map(
		definitions.map((group) => [group.id, group.padding]),
	);
	const disks: GroupDisk[] = [...members]
		.map(([id, nodes]) => {
			const xs = nodes.map((node) => graph.getNodeAttribute(node, 'x')),
				ys = nodes.map((node) => graph.getNodeAttribute(node, 'y'));
			const left = Math.min(...xs),
				right = Math.max(...xs),
				bottom = Math.min(...ys),
				top = Math.max(...ys);
			const margin =
				unit *
				(0.4 + 0.4 * scaleLayoutGroupPadding(padding.get(id) ?? 0.32));
			return {
				id,
				nodes,
				x: (left + right) / 2,
				y: (bottom + top) / 2,
				radius: Math.hypot(
					(right - left) / 2 + margin,
					(top - bottom) / 2 + margin,
				),
			};
		})
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const translate = (disk: GroupDisk, dx: number, dy: number): void => {
		disk.x += dx;
		disk.y += dy;
		for (const id of disk.nodes) {
			const p = graph.getNodeAttributes(id);
			graph.mergeNodeAttributes(id, { x: p.x + dx, y: p.y + dy });
		}
	};
	// Place each disk against the already final disks. A deterministic fallback
	// avoids residual overlaps in dense groups of three or more containers.
	for (let i = 1; i < disks.length; i++) {
		const current = disks[i]!,
			placed = disks.slice(0, i);
		for (let pass = 0; pass < 32; pass++) {
			let moved = false;
			for (const other of placed) {
				const minimum = current.radius + other.radius + unit * 0.2;
				const dx = current.x - other.x,
					dy = current.y - other.y,
					d = Math.hypot(dx, dy);
				if (d >= minimum - 1e-9) continue;
				const nx = d > 1e-9 ? dx / d : 1,
					ny = d > 1e-9 ? dy / d : 0;
				translate(
					current,
					nx * (minimum - d + 1e-8),
					ny * (minimum - d + 1e-8),
				);
				moved = true;
			}
			if (!moved) break;
		}
		if (
			placed.some(
				(other) =>
					Math.hypot(current.x - other.x, current.y - other.y) <
					current.radius + other.radius + unit * 0.2 - 1e-9,
			)
		) {
			const right = Math.max(
				...placed.map((other) => other.x + other.radius),
			);
			translate(
				current,
				right + current.radius + unit * 0.2 - current.x,
				0,
			);
		}
	}
	// Whole-group moves can cover an ungrouped note. Preserve Group geometry and
	// move only such notes out of their final frames.
	const grouped = new Set(disks.flatMap((disk) => disk.nodes));
	for (const id of graph.nodes().sort()) {
		if (
			grouped.has(id) ||
			graph.getNodeAttribute(id, 'isBend') ||
			graph.getNodeAttribute(id, 'hidden')
		)
			continue;
		const point = {
			x: graph.getNodeAttribute(id, 'x'),
			y: graph.getNodeAttribute(id, 'y'),
		};
		let moved = false;
		for (let pass = 0; pass < disks.length + 1; pass++) {
			let overlap = false;
			for (const disk of disks) {
				const dx = point.x - disk.x,
					dy = point.y - disk.y,
					d = Math.hypot(dx, dy),
					minimum = disk.radius + unit * 0.1;
				if (d >= minimum - 1e-9) continue;
				point.x = disk.x + (d > 1e-9 ? dx / d : 1) * (minimum + 1e-8);
				point.y = disk.y + (d > 1e-9 ? dy / d : 0) * (minimum + 1e-8);
				overlap = true;
				moved = true;
			}
			if (!overlap) break;
		}
		if (
			disks.some(
				(disk) =>
					Math.hypot(point.x - disk.x, point.y - disk.y) <
					disk.radius + unit * 0.1 - 1e-9,
			)
		) {
			point.x =
				Math.max(...disks.map((disk) => disk.x + disk.radius)) +
				unit * 0.1;
		}
		if (moved) graph.mergeNodeAttributes(id, point);
	}
}
