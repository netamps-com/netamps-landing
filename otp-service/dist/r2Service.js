"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUploadUrl = generateUploadUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const uuid_1 = require("uuid");
const r2 = new client_s3_1.S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});
async function generateUploadUrl(filename, mimeType, fileSize) {
    // Security Restrictions as per Industry Standard
    const MAX_SIZE_MB = 100; // 100 MB max for videos/photos
    if (fileSize > MAX_SIZE_MB * 1024 * 1024) {
        return { success: false, message: `File size exceeds the ${MAX_SIZE_MB}MB limit.` };
    }
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
    if (!allowedMimeTypes.includes(mimeType)) {
        return { success: false, message: 'Invalid file type. Only JPEG, PNG, WEBP, MP4, and WEBM are allowed.' };
    }
    const ext = filename.split('.').pop() || 'bin';
    const objectKey = `returns/${Date.now()}-${(0, uuid_1.v4)()}.${ext}`;
    try {
        const command = new client_s3_1.PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME || 'netamps-assets',
            Key: objectKey,
            ContentType: mimeType,
        });
        const url = await (0, s3_request_presigner_1.getSignedUrl)(r2, command, { expiresIn: 3600 });
        return { success: true, url, objectKey };
    }
    catch (error) {
        console.error('Error generating pre-signed URL:', error);
        return { success: false, message: 'Failed to generate secure upload link.' };
    }
}
