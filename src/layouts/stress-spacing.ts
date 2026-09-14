import type { RuntimeGraph } from '@/graph/model/graphology-adapter';

interface Point {
	x: number;
	y: number;
}
interface Box {
	left: number;
	right: number;
	bottom: number;
	top: number;
}

/** Deterministic, geometry-only readability pass. Work on the private layout
 * graph; preserve topology, component orientation, and explicit Group membership.
 * Units are the configured nominal edge distance, independent of viewport/style.
 */
export async function refineStressSpacing(
	graph: RuntimeGraph,
	ids: readonly string[],
	groups: ReadonlyMap<string, string>,
	unit: number,
	checkpoint: () => Promise<boolean>,
): Promise<boolean> {
	if (ids.length < 2 || unit <= 0) return true;
	const index = new Map(ids.map((id, i) => [id, i]));
	const parent = ids.map((_, i) => i);
	const root = (i: number): number => {
		while (parent[i] !== i) {
			parent[i] = parent[parent[i]!]!;
			i = parent[i]!;
		}
		return i;
	};
	const join = (a: number, b: number): void => {
		const x = root(a),
			y = root(b);
		parent[Math.max(x, y)] = Math.min(x, y);
	};
	graph.forEachEdge((_id, _attributes, source, target) => {
		const a = index.get(source),
			b = index.get(target);
		if (a !== undefined && b !== undefined) join(a, b);
	});
	const firstByGroup = new Map<string, number>();
	ids.forEach((id, i) => {
		const group = groups.get(id);
		if (!group) return;
		const first = firstByGroup.get(group);
		if (first === undefined) firstByGroup.set(group, i);
		else join(first, i);
	});
	const components = new Map<number, number[]>();
	ids.forEach((_, i) => {
		const key = root(i),
			members = components.get(key) ?? [];
		members.push(i);
		components.set(key, members);
	});
	const points: Point[] = ids.map((id) => {
		const { x, y } = graph.getNodeAttributes(id);
		return { x, y };
	});
	const sets = [...components.values()].sort(
		(a, b) => b.length - a.length || a[0]! - b[0]!,
	);
	for (const members of sets) {
		const center = {
			x: median(members.map((i) => points[i]!.x)),
			y: median(members.map((i) => points[i]!.y)),
		};
		// Leave the central three edge lengths untouched; compress only long tails.
		for (const i of members) {
			const point = points[i]!,
				dx = point.x - center.x,
				dy = point.y - center.y,
				r = Math.hypot(dx, dy) / unit;
			if (r > 3) {
				const scale = (3 + 2 * Math.log1p((r - 3) / 2)) / r;
				point.x = center.x + dx * scale;
				point.y = center.y + dy * scale;
			}
		}
		const anchors = members.map((i) => ({ ...points[i]! }));
		// Local separation, with weak tethers to prevent unconstrained force drift.
		const minimum = 0.65 * unit;
		for (let step = 0; step < 100; step++) {
			const shifts = members.map(() => ({ x: 0, y: 0, count: 0 }));
			for (let a = 0; a < members.length; a++) {
				for (let b = a + 1; b < members.length; b++) {
					const p = points[members[a]!]!,
						q = points[members[b]!]!;
					let dx = q.x - p.x,
						dy = q.y - p.y,
						d = Math.hypot(dx, dy);
					if (d >= minimum) continue;
					if (d < 1e-9) {
						const angle =
							(((members[a]! + 1) * 137.508 +
								(members[b]! + 1) * 67.123) *
								Math.PI) /
							180;
						dx = Math.cos(angle);
						dy = Math.sin(angle);
						d = 1;
						const push = minimum * 0.5;
						shifts[a]!.x -= dx * push;
						shifts[a]!.y -= dy * push;
						shifts[b]!.x += dx * push;
						shifts[b]!.y += dy * push;
					} else {
						const push = ((minimum - d) * 0.5) / d;
						shifts[a]!.x -= dx * push;
						shifts[a]!.y -= dy * push;
						shifts[b]!.x += dx * push;
						shifts[b]!.y += dy * push;
					}
					shifts[a]!.count++;
					shifts[b]!.count++;
				}
				if (a % 32 === 0 && !(await checkpoint())) return false;
			}
			members.forEach((i, a) => {
				const p = points[i]!,
					shift = shifts[a]!,
					anchor = anchors[a]!;
				const divisor = Math.max(1, Math.sqrt(shift.count));
				p.x += (shift.x / divisor) * 0.8 + (anchor.x - p.x) * 0.01;
				p.y += (shift.y / divisor) * 0.8 + (anchor.y - p.y) * 0.01;
			});
		}
	}
	// Largest component keeps its location. Pack satellites by translation only.
	const placed: Box[] = [];
	let envelope: Box | undefined;
	const gap = unit;
	for (const members of sets) {
		const box = bounds(members, points),
			width = Math.max(box.right - box.left, 0.65 * unit),
			height = Math.max(box.top - box.bottom, 0.65 * unit);
		let left = box.left,
			bottom = box.bottom;
		if (envelope) {
			let best = Infinity;
			for (const other of placed) {
				const candidates = [
					[other.right + gap, other.bottom],
					[other.right + gap, other.top - height],
					[other.left - gap - width, other.bottom],
					[other.left - gap - width, other.top - height],
					[other.left, other.top + gap],
					[other.right - width, other.top + gap],
					[other.left, other.bottom - gap - height],
					[other.right - width, other.bottom - gap - height],
				];
				for (const [x, y] of candidates) {
					const candidate = {
						left: x!,
						right: x! + width,
						bottom: y!,
						top: y! + height,
					};
					if (
						placed.some(
							(p) =>
								candidate.left < p.right + gap - 1e-9 &&
								candidate.right > p.left - gap + 1e-9 &&
								candidate.bottom < p.top + gap - 1e-9 &&
								candidate.top > p.bottom - gap + 1e-9,
						)
					)
						continue;
					const union = combine(envelope, candidate),
						w = union.right - union.left,
						h = union.top - union.bottom;
					const score = w * h + 0.2 * Math.max(w, h) ** 2;
					if (score < best) {
						best = score;
						left = x!;
						bottom = y!;
					}
				}
				if (!(await checkpoint())) return false;
			}
		}
		const dx = left - box.left,
			dy = bottom - box.bottom;
		members.forEach((i) => {
			points[i]!.x += dx;
			points[i]!.y += dy;
		});
		const occupied = {
			left,
			right: left + width,
			bottom,
			top: bottom + height,
		};
		placed.push(occupied);
		envelope = envelope ? combine(envelope, occupied) : occupied;
	}
	if (!(await checkpoint())) return false;
	ids.forEach((id, i) => graph.mergeNodeAttributes(id, points[i]!));
	return true;
}

function median(values: number[]): number {
	values.sort((a, b) => a - b);
	const mid = Math.floor(values.length / 2);
	return values.length % 2
		? values[mid]!
		: (values[mid - 1]! + values[mid]!) / 2;
}
function bounds(members: readonly number[], points: readonly Point[]): Box {
	return {
		left: Math.min(...members.map((i) => points[i]!.x)),
		right: Math.max(...members.map((i) => points[i]!.x)),
		bottom: Math.min(...members.map((i) => points[i]!.y)),
		top: Math.max(...members.map((i) => points[i]!.y)),
	};
}
function combine(a: Box, b: Box): Box {
	return {
		left: Math.min(a.left, b.left),
		right: Math.max(a.right, b.right),
		bottom: Math.min(a.bottom, b.bottom),
		top: Math.max(a.top, b.top),
	};
}
