import { spawn } from 'node:child_process';
import process from 'node:process';

const commands = [
	['node', ['scripts/build-css.mjs', '--watch']],
	['node', ['esbuild.config.mjs']],
];

const children = commands.map(([command, args]) =>
	spawn(command, args, {
		stdio: 'inherit',
		env: process.env,
	}),
);

let shuttingDown = false;

function stopAll(exitCode = 0) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	for (const child of children) {
		child.kill('SIGINT');
	}
	process.exit(exitCode);
}

for (const child of children) {
	child.on('exit', (code, signal) => {
		if (shuttingDown) {
			return;
		}
		if (code !== 0 || signal) {
			stopAll(code ?? 1);
		}
	});
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
