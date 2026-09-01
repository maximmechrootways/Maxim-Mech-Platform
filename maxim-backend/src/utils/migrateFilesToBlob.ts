import { prisma } from '../lib/prisma'
import { uploadBlob } from '../services/blobStorageService'
import fs from 'fs'
import path from 'path'

export async function migrateLocalFilesToBlob() {
    const uploadDir = path.join(
        __dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads'
    )

    const templates = await prisma.pdfTemplate.findMany({
        where: { isActive: true }
    })

    console.log(`Checking ${templates.length} templates for migration`)
    let migrated = 0
    let skipped = 0

    for (const template of templates) {
        // Already a blob name — skip
        if (
            template.filePath.startsWith('templates/') ||
            template.filePath.startsWith('documents/')
        ) {
            skipped++
            continue
        }

        const localPath = path.isAbsolute(template.filePath)
            ? template.filePath
            : path.join(uploadDir, path.basename(template.filePath))

        if (!fs.existsSync(localPath)) {
            console.warn(`Local file not found for ${template.id}: ${localPath}`)
            skipped++
            continue
        }

        try {
            // Copy file to a temp location so uploadBlob doesn't delete the original
            const tempPath = `${localPath}.migrating`
            fs.copyFileSync(localPath, tempPath)

            const blobName = await uploadBlob(tempPath, 'templates')

            await prisma.pdfTemplate.update({
                where: { id: template.id },
                data: { filePath: blobName }
            })

            console.log(`Migrated ${template.id}: ${template.filePath} → ${blobName}`)
            migrated++
        } catch (err: any) {
            console.error(`Failed to migrate ${template.id}:`, err.message)
        }
    }

    console.log(`Done: ${migrated} migrated, ${skipped} skipped`)
}
