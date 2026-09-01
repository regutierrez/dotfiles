// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
import type { PluginAPI } from '@ampcode/plugin'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const HERDR_METADATA_SOURCE = 'user:amp-runner-label'
const RUNNER_TITLE_PATTERN = /\((\d+) threads?\) - amp runner$/u
const REFRESH_INTERVAL_MS = 2_000

/** Extract the live thread count from an Amp runner terminal title. */
export function parseAmpRunnerThreadCount(title: string): number | undefined {
	const match = RUNNER_TITLE_PATTERN.exec(title)
	if (!match?.[1]) {
		return undefined
	}

	const count = Number.parseInt(match[1], 10)
	return Number.isSafeInteger(count) ? count : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseHerdrPaneTerminalTitle(stdout: string): string | undefined {
	let response: unknown
	try {
		response = JSON.parse(stdout)
	} catch {
		return undefined
	}

	if (!isRecord(response) || !isRecord(response.result) || !isRecord(response.result.pane)) {
		return undefined
	}
	const title = response.result.pane.terminal_title
	return typeof title === 'string' ? title : undefined
}

export default function herdrRunnerLabelPlugin(amp: PluginAPI) {
	if (process.env.HERDR_ENV !== '1' || !process.env.HERDR_PANE_ID) {
		return
	}

	const herdrBin = process.env.HERDR_BIN_PATH || 'herdr'
	const paneID = process.env.HERDR_PANE_ID
	let displayedCount: number | undefined
	let refreshPromise: Promise<void> | undefined
	let loggedFailure = false

	const runHerdr = async (args: string[]): Promise<string> => {
		const result = await execFileAsync(herdrBin, args, { encoding: 'utf8' })
		return result.stdout
	}

	const refreshRunnerLabel = async (): Promise<void> => {
		try {
			const pane = await runHerdr(['pane', 'get', paneID])
			const title = parseHerdrPaneTerminalTitle(pane)
			const count = title ? parseAmpRunnerThreadCount(title) : undefined
			if (count === undefined || count === displayedCount) {
				return
			}

			await runHerdr([
				'pane',
				'report-metadata',
				paneID,
				'--source',
				HERDR_METADATA_SOURCE,
				'--agent',
				'amp',
				'--display-agent',
				`amp (runner) - ${count} threads`,
			])
			displayedCount = count
		} catch (error) {
			if (!loggedFailure) {
				loggedFailure = true
				amp.logger.log('[herdr-runner-label] failed to update the Amp runner label', String(error))
			}
		}
	}

	const requestRefresh = (): void => {
		if (refreshPromise) {
			return
		}
		refreshPromise = refreshRunnerLabel().finally(() => {
			refreshPromise = undefined
		})
	}

	requestRefresh()
	const refreshTimer = setInterval(requestRefresh, REFRESH_INTERVAL_MS)

	amp.onDispose(async () => {
		clearInterval(refreshTimer)
		await refreshPromise
		try {
			await runHerdr([
				'pane',
				'report-metadata',
				paneID,
				'--source',
				HERDR_METADATA_SOURCE,
				'--agent',
				'amp',
				'--clear-display-agent',
			])
		} catch {
			// The pane may already be gone during runner shutdown.
		}
	})
}
