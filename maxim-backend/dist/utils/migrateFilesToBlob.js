"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateLocalFilesToBlob = migrateLocalFilesToBlob;
const prisma_1 = require("../lib/prisma");
const blobStorageService_1 = require("../services/blobStorageService");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function migrateLocalFilesToBlob() {
    const uploadDir = path_1.default.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
    const templates = await prisma_1.prisma.pdfTemplate.findMany({
        where: { isActive: true }
    });
    console.log(`Checking ${templates.length} templates for migration`);
    let migrated = 0;
    let skipped = 0;
    for (const template of templates) {
        // Already a blob name — skip
        if (template.filePath.startsWith('templates/') ||
            template.filePath.startsWith('documents/')) {
            skipped++;
            continue;
        }
        const localPath = path_1.default.isAbsolute(template.filePath)
            ? template.filePath
            : path_1.default.join(uploadDir, path_1.default.basename(template.filePath));
        if (!fs_1.default.existsSync(localPath)) {
            console.warn(`Local file not found for ${template.id}: ${localPath}`);
            skipped++;
            continue;
        }
        try {
            // Copy file to a temp location so uploadBlob doesn't delete the original
            const tempPath = `${localPath}.migrating`;
            fs_1.default.copyFileSync(localPath, tempPath);
            const blobName = await (0, blobStorageService_1.uploadBlob)(tempPath, 'templates');
            await prisma_1.prisma.pdfTemplate.update({
                where: { id: template.id },
                data: { filePath: blobName }
            });
            console.log(`Migrated ${template.id}: ${template.filePath} → ${blobName}`);
            migrated++;
        }
        catch (err) {
            console.error(`Failed to migrate ${template.id}:`, err.message);
        }
    }
    console.log(`Done: ${migrated} migrated, ${skipped} skipped`);
}
