// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
// Required by Amp: this exact marker must remain the first line in the plugin file.
import type { PluginAPI, ToolResultEvent } from '@ampcode/plugin'
import { spawn } from 'child_process'
import { isAbsolute, resolve } from 'path'

type ProcessResult = {
	exitCode: number
	stdout: string
}

type PendingHistory = {
	cwd: string
	historyID: string
}

function runProcess(
	command: string,
	args: string[],
	options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<ProcessResult> {
	return new Promise((resolveProcess, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
			stdio: ['ignore', 'pipe', 'ignore'],
		})

		let stdout = ''
		child.stdout.on('data', (chunk: unknown) => {
			stdout += chunk.toString()
		})
		child.on('error', reject)
		child.on('close', (code) => {
			resolveProcess({ exitCode: code ?? -1, stdout })
		})
	})
}

function resultExitCode(event: ToolResultEvent): number {
	if (event.output && typeof event.output === 'object' && !Array.isArray(event.output)) {
		const exitCode = (event.output as Record<string, unknown>).exitCode
		if (typeof exitCode === 'number') {
			return exitCode
		}
	}

	return event.status === 'done' ? 0 : 1
}

function pendingKey(threadID: string, toolUseID: string): string {
	return `${threadID}\0${toolUseID}`
}

export default function atuinHistoryPlugin(amp: PluginAPI) {
	const pendingHistory = new Map<string, PendingHistory>()
	const workspaceRoot = amp.system.workspaceRoot
		? amp.helpers.filePathFromURI(amp.system.workspaceRoot)
		: process.cwd()
	let hasLoggedFailure = false

	const logFailureOnce = (operation: string, error?: unknown) => {
		if (hasLoggedFailure) {
			return
		}
		hasLoggedFailure = true
		amp.logger.log(
			`[atuin-history] ${operation} failed; Amp shell commands will continue without Atuin history`,
			error ? String(error) : '',
		)
	}

	const atuinEnv = (threadID: string, cwd: string): NodeJS.ProcessEnv => ({
		...process.env,
		ATUIN_LOG: 'error',
		ATUIN_SESSION: threadID,
		PWD: cwd,
	})

	amp.on('tool.call', async (event, ctx) => {
		const shell = amp.helpers.shellCommandFromToolCall(event)
		if (!shell) {
			return { action: 'allow' as const }
		}

		const inputWorkdir =
			typeof event.input.workdir === 'string'
				? event.input.workdir
				: typeof event.input.cwd === 'string'
					? event.input.cwd
					: undefined
		const requestedCwd = shell.dir ?? inputWorkdir
		const cwd = requestedCwd
			? isAbsolute(requestedCwd)
				? requestedCwd
				: resolve(workspaceRoot, requestedCwd)
			: workspaceRoot
		let title: string | null = null
		try {
			title = await ctx.thread.title.get()
		} catch {
			// A thread title is useful context, but history recording does not depend on it.
		}
		const normalizedTitle = title?.replace(/\s+/g, ' ').trim().slice(0, 200)
		const intent = normalizedTitle
			? `thread=${event.thread.id} title=${normalizedTitle}`
			: `thread=${event.thread.id}`

		try {
			const result = await runProcess(
				'atuin',
				['history', 'start', '--author', 'amp', '--intent', intent, '--', shell.command],
				{ cwd, env: atuinEnv(event.thread.id, cwd) },
			)
			if (result.exitCode !== 0) {
				logFailureOnce(`history start (exit=${result.exitCode})`)
				return { action: 'allow' as const }
			}

			const historyID = result.stdout.trim()
			if (historyID) {
				pendingHistory.set(pendingKey(event.thread.id, event.toolUseID), {
					cwd,
					historyID,
				})
			}
		} catch (error) {
			logFailureOnce('history start', error)
		}

		return { action: 'allow' as const }
	})

	amp.on('tool.result', async (event) => {
		const key = pendingKey(event.thread.id, event.toolUseID)
		const pending = pendingHistory.get(key)
		if (!pending) {
			return
		}
		pendingHistory.delete(key)

		try {
			const result = await runProcess(
				'atuin',
				[
					'history',
					'end',
					'--exit',
					String(resultExitCode(event)),
					'--',
					pending.historyID,
				],
				{ cwd: pending.cwd, env: atuinEnv(event.thread.id, pending.cwd) },
			)
			if (result.exitCode !== 0) {
				logFailureOnce(`history end (exit=${result.exitCode})`)
			}
		} catch (error) {
			logFailureOnce('history end', error)
		}
	})
}
