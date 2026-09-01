"use strict";
/**
 * Batch importer for IHSA safety talks into ToolboxTopic catalog.
 *
 * Usage:
 *   npx ts-node src/scripts/importToolboxTopics.ts --offset=0 --batchSize=25 --batchTag=ihsa-apr
 */
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const toolboxTopicService_1 = require("../services/toolboxTopicService");
function readArg(name) {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : undefined;
}
async function run() {
    const offset = Number(readArg('offset') ?? 0) || 0;
    const batchSize = Number(readArg('batchSize') ?? 25) || 25;
    const batchTag = readArg('batchTag') ?? undefined;
    const sourcePageUrl = readArg('sourcePageUrl') ?? undefined;
    const dryRun = (readArg('dryRun') ?? '').toLowerCase() === 'true';
    const result = await (0, toolboxTopicService_1.importToolboxTopics)({
        offset,
        batchSize,
        batchTag,
        sourcePageUrl,
        dryRun,
    });
    console.log('[Toolbox Import] Result');
    console.log(JSON.stringify(result, null, 2));
    await prisma_1.prisma.$disconnect();
}
run().catch(async (error) => {
    console.error('[Toolbox Import] Fatal error:', error);
    await prisma_1.prisma.$disconnect();
    process.exit(1);
});
