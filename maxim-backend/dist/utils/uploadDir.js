"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUploadDir = getUploadDir;
exports.ensureUploadDir = ensureUploadDir;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
/**
 * Writable directory for multer temp files.
 * Prefer Azure/App Service temp when UPLOAD_DIR is unset — wwwroot can be tight on disk quota.
 */
function getUploadDir() {
    if (process.env.UPLOAD_DIR) {
        return path_1.default.isAbsolute(process.env.UPLOAD_DIR)
            ? process.env.UPLOAD_DIR
            : path_1.default.resolve(process.cwd(), process.env.UPLOAD_DIR);
    }
    return path_1.default.join(os_1.default.tmpdir(), 'maxim-uploads');
}
function ensureUploadDir() {
    const dir = getUploadDir();
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
