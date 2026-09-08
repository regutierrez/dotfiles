import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseAmpRunnerThreadCount } from '../dot_config/private_amp/plugins/herdr-runner-label.ts'

describe('parseAmpRunnerThreadCount', () => {
	test('reads singular and plural Amp runner thread counts', () => {
		assert.equal(parseAmpRunnerThreadCount('~/repo (1 thread) - amp runner'), 1)
		assert.equal(parseAmpRunnerThreadCount('/tmp/project (12 threads) - amp runner'), 12)
	})

	test('ignores non-runner terminal titles', () => {
		assert.equal(parseAmpRunnerThreadCount('~/repo - amp'), undefined)
		assert.equal(parseAmpRunnerThreadCount('Plugin confirmation needed'), undefined)
	})
})
