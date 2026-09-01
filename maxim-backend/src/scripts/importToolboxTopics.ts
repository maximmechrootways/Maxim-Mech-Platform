/**
 * Batch importer for IHSA safety talks into ToolboxTopic catalog.
 *
 * Usage:
 *   npx ts-node src/scripts/importToolboxTopics.ts --offset=0 --batchSize=25 --batchTag=ihsa-apr
 */

import { prisma } from '../lib/prisma'
import { importToolboxTopics } from '../services/toolboxTopicService'

function readArg(name: string) {
  const prefix = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : undefined
}

async function run() {
  const offset = Number(readArg('offset') ?? 0) || 0
  const batchSize = Number(readArg('batchSize') ?? 25) || 25
  const batchTag = readArg('batchTag') ?? undefined
  const sourcePageUrl = readArg('sourcePageUrl') ?? undefined
  const dryRun = (readArg('dryRun') ?? '').toLowerCase() === 'true'

  const result = await importToolboxTopics({
    offset,
    batchSize,
    batchTag,
    sourcePageUrl,
    dryRun,
  })

  console.log('[Toolbox Import] Result')
  console.log(JSON.stringify(result, null, 2))
  await prisma.$disconnect()
}

run().catch(async (error) => {
  console.error('[Toolbox Import] Fatal error:', error)
  await prisma.$disconnect()
  process.exit(1)
})
