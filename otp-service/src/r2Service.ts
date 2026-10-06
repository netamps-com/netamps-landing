import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

export async function generateUploadUrl(filename: string, mimeType: string, fileSize: number) {
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
  const objectKey = `returns/${Date.now()}-${uuidv4()}.${ext}`;

  try {
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || 'netamps-assets',
      Key: objectKey,
      ContentType: mimeType,
    });

    const url = await getSignedUrl(r2, command, { expiresIn: 3600 });
    return { success: true, url, objectKey };
  } catch (error) {
    console.error('Error generating pre-signed URL:', error);
    return { success: false, message: 'Failed to generate secure upload link.' };
  }
}
