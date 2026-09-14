import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import type { LayoutEngine } from '@/layouts/layout-engine';
import { compactGraphGroups } from '@/layouts/graph-group-layout';

type Point = [number, number];
type Matrix = Float64Array[];
const matrix = (n: number): Matrix =>
	Array.from({ length: n }, () => new Float64Array(n));

/** Browser port of the research multilevel-stress candidate: one greedy
 * coarsening, 180 coarse iterations, then 180 fine iterations anchored at 0.3.
 * All-pairs distances ignore direction, parallel edges and self loops.
 * O(n²) storage and O(n³) factorization; no previous geometry is read.
 */
export class MultilevelStressLayout implements LayoutEngine {
	private lastYield = -Infinity;
	constructor(
		private readonly spacing = 1,
		private readonly linkDistance = 250,
		private readonly groupByNode: ReadonlyMap<string, string> = new Map(),
		private readonly isStale: () => boolean = () => false,
		private readonly yieldControl: () => Promise<void> = () =>
			Promise.resolve(),
	) {}

	async apply(graph: RuntimeGraph): Promise<void> {
		const ids = graph
			.nodes()
			.filter((id) => !graph.getNodeAttribute(id, 'isBend'))
			.sort();
		const n = ids.length;
		if (!n || this.isStale()) return;
		const index = new Map(ids.map((id, i) => [id, i]));
		const adjacency = Array.from({ length: n }, () => new Set<number>());
		graph.forEachEdge((_key, _attributes, source, target) => {
			const a = index.get(source),
				b = index.get(target);
			if (a !== undefined && b !== undefined && a !== b) {
				adjacency[a]!.add(b);
				adjacency[b]!.add(a);
			}
		});
		const neighbors = adjacency.map((set) =>
			[...set].sort((a, b) => a - b),
		);
		const distance = matrix(n);
		for (let i = 0; i < n; i++) {
			const row = distance[i]!;
			row.fill(Infinity);
			row[i] = 0;
			const queue = [i];
			for (let head = 0; head < queue.length; head++) {
				const a = queue[head]!;
				for (const b of neighbors[a]!)
					if (!Number.isFinite(row[b])) {
						row[b] = row[a]! + 1;
						queue.push(b);
					}
			}
			if (i % 16 === 0 && !(await this.checkpoint())) return;
		}
		// SHA-256 and little-endian coordinates match the Python reference exactly.
		const seeds = await Promise.all(
			ids.map(async (id): Promise<Point> => {
				const digest = await crypto.subtle.digest(
					'SHA-256',
					new TextEncoder().encode(id),
				);
				const view = new DataView(digest);
				return [0, 4].map(
					(offset) =>
						(view.getUint32(offset, true) / 2 ** 32 - 0.5) * 8,
				) as Point;
			}),
		);
		if (this.isStale()) return;
		const remaining = new Set(ids.map((_, i) => i));
		const clusters: number[][] = [];
		for (let i = 0; i < n; i++) {
			if (!remaining.delete(i)) continue;
			let best = -1,
				score = -1;
			for (const j of neighbors[i]!)
				if (remaining.has(j)) {
					let common = 0;
					for (const k of neighbors[i]!)
						if (adjacency[j]!.has(k)) common++;
					if (common > score) {
						best = j;
						score = common;
					}
				}
			const members = [i];
			if (best >= 0) {
				remaining.delete(best);
				members.push(best);
			}
			clusters.push(members);
			if (i % 16 === 0 && !(await this.checkpoint())) return;
		}
		const coarse = matrix(clusters.length);
		const initial: Point[] = clusters.map((members) => [
			members.reduce((sum, i) => sum + seeds[i]![0], 0) / members.length,
			members.reduce((sum, i) => sum + seeds[i]![1], 0) / members.length,
		]);
		for (let a = 0; a < clusters.length; a++) {
			for (let b = 0; b < clusters.length; b++) {
				let minimum = Infinity;
				for (const i of clusters[a]!)
					for (const j of clusters[b]!)
						minimum = Math.min(minimum, distance[i]![j]!);
				coarse[a]![b] = minimum;
			}
			if (a % 16 === 0 && !(await this.checkpoint())) return;
		}
		const centers = await this.solve(coarse, initial, 0);
		if (!centers) return;
		const reference: Point[] = seeds.map((point) => [...point]);
		clusters.forEach((members, a) =>
			members.forEach((i) => {
				reference[i] = [
					centers[a]![0] + seeds[i]![0] * 0.1,
					centers[a]![1] + seeds[i]![1] * 0.1,
				];
			}),
		);
		const positions = await this.solve(distance, reference, 0.3);
		if (!positions || this.isStale()) return;
		// Fixed scale avoids making a peripheral edge change resize the whole graph.
		const scale = (Math.max(this.linkDistance, 1) / 100) * this.spacing;
		const working = graph.copy();
		ids.forEach((id, i) =>
			working.mergeNodeAttributes(id, {
				x: positions[i]![0] * scale,
				y: positions[i]![1] * scale,
				fixed: false,
			}),
		);
		compactGraphGroups(
			working,
			new Map(
				[...this.groupByNode].sort(([a], [b]) =>
					a < b ? -1 : a > b ? 1 : 0,
				),
			),
			this.spacing,
			this.linkDistance,
		);
		if (this.isStale()) return;
		ids.forEach((id) => {
			const { x, y } = working.getNodeAttributes(id);
			graph.mergeNodeAttributes(id, { x, y, fixed: false });
		});
	}

	private async checkpoint(): Promise<boolean> {
		if (this.isStale()) return false;
		if (performance.now() - this.lastYield < 8) return true;
		await this.yieldControl();
		this.lastYield = performance.now();
		return !this.isStale();
	}

	private async solve(
		distance: Matrix,
		initial: Point[],
		strength: number,
	): Promise<Point[] | undefined> {
		const n = distance.length;
		const weights = matrix(n),
			ideal = matrix(n),
			lower = matrix(n);
		for (let i = 0; i < n; i++) {
			let diagonal = strength;
			for (let j = 0; j < n; j++) {
				const d = Number.isFinite(distance[i]![j])
					? distance[i]![j]!
					: 12;
				const w = i === j ? 0 : 1 / Math.max(d, 1) ** 2;
				ideal[i]![j] = d;
				weights[i]![j] = w;
				lower[i]![j] = 1 / n - w;
				diagonal += w;
			}
			lower[i]![i] = diagonal + 1 / n;
			if (i % 16 === 0 && !(await this.checkpoint())) return;
		}
		// Cholesky solves the same SPD system as the reference's explicit inverse.
		for (let i = 0; i < n; i++) {
			for (let j = 0; j <= i; j++) {
				let value = lower[i]![j]!;
				for (let k = 0; k < j; k++)
					value -= lower[i]![k]! * lower[j]![k]!;
				lower[i]![j] =
					i === j ? Math.sqrt(value) : value / lower[j]![j]!;
			}
			if (!(await this.checkpoint())) return;
		}
		const mean: Point = [0, 0];
		for (const point of initial) {
			mean[0] += point[0] / n;
			mean[1] += point[1] / n;
		}
		const anchor: Point[] = initial.map((p) => [
			strength * (p[0] - mean[0]),
			strength * (p[1] - mean[1]),
		]);
		let x = initial.map((p) => [...p] as Point);
		for (let iteration = 0; iteration < 180; iteration++) {
			const rhs = anchor.map((p) => [...p] as Point);
			for (let i = 0; i < n; i++) {
				for (let j = i + 1; j < n; j++) {
					const dx = x[i]![0] - x[j]![0],
						dy = x[i]![1] - x[j]![1];
					const ratio =
						(weights[i]![j]! * ideal[i]![j]!) /
						Math.max(Math.hypot(dx, dy), 1e-9);
					rhs[i]![0] += ratio * dx;
					rhs[i]![1] += ratio * dy;
					rhs[j]![0] -= ratio * dx;
					rhs[j]![1] -= ratio * dy;
				}
				if (i % 32 === 0 && !(await this.checkpoint())) return;
			}
			for (let i = 0; i < n; i++) {
				for (let j = 0; j < i; j++) {
					rhs[i]![0] -= lower[i]![j]! * rhs[j]![0];
					rhs[i]![1] -= lower[i]![j]! * rhs[j]![1];
				}
				rhs[i]![0] /= lower[i]![i]!;
				rhs[i]![1] /= lower[i]![i]!;
			}
			for (let i = n - 1; i >= 0; i--) {
				for (let j = i + 1; j < n; j++) {
					rhs[i]![0] -= lower[j]![i]! * rhs[j]![0];
					rhs[i]![1] -= lower[j]![i]! * rhs[j]![1];
				}
				rhs[i]![0] /= lower[i]![i]!;
				rhs[i]![1] /= lower[i]![i]!;
			}
			x = rhs;
		}
		return x;
	}
}
