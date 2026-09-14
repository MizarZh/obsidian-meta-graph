import { execFileSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';

export function environment() {
	return {
		createdAt: new Date().toISOString(),
		commit: execFileSync('git', ['rev-parse', 'HEAD'], {
			encoding: 'utf8',
		}).trim(),
		dirty:
			execFileSync('git', ['status', '--porcelain'], {
				encoding: 'utf8',
			}).trim() !== '',
		node: process.version,
		platform: platform(),
		arch: arch(),
		cpu: cpus()[0]?.model,
		lockfileSha256: createHash('sha256')
			.update(readFileSync('pnpm-lock.yaml'))
			.digest('hex'),
	};
}
