import { describe, expect, test } from 'bun:test'
import { parseAmpRunnerThreadCount } from '../dot_config/private_amp/plugins/herdr-runner-label'

describe('parseAmpRunnerThreadCount', () => {
	test('reads singular and plural Amp runner thread counts', () => {
		expect(parseAmpRunnerThreadCount('~/repo (1 thread) - amp runner')).toBe(1)
		expect(parseAmpRunnerThreadCount('/tmp/project (12 threads) - amp runner')).toBe(12)
	})

	test('ignores non-runner terminal titles', () => {
		expect(parseAmpRunnerThreadCount('~/repo - amp')).toBeUndefined()
		expect(parseAmpRunnerThreadCount('Plugin confirmation needed')).toBeUndefined()
	})
})
