import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Writable directory for multer temp files.
 * Prefer Azure/App Service temp when UPLOAD_DIR is unset — wwwroot can be tight on disk quota.
 */
export function getUploadDir(): string {
    if (process.env.UPLOAD_DIR) {
        return path.isAbsolute(process.env.UPLOAD_DIR)
            ? process.env.UPLOAD_DIR
            : path.resolve(process.cwd(), process.env.UPLOAD_DIR)
    }
    return path.join(os.tmpdir(), 'maxim-uploads')
}

export function ensureUploadDir(): string {
    const dir = getUploadDir()
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return dir
}
