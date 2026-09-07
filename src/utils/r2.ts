import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs/promises";
import path from "node:path";
import { getEnvVar } from "./auth";

export function getR2Client(): S3Client {
	const accountId = getEnvVar("R2_ACCOUNT_ID");
	const accessKeyId = getEnvVar("R2_ACCESS_KEY_ID");
	const secretAccessKey = getEnvVar("R2_SECRET_ACCESS_KEY");

	return new S3Client({
		region: "auto",
		endpoint: accountId
			? `https://${accountId}.r2.cloudflarestorage.com`
			: "https://mock.r2.cloudflarestorage.com",
		credentials: {
			accessKeyId: accessKeyId || "mock-key",
			secretAccessKey: secretAccessKey || "mock-secret",
		},
	});
}

export function isR2Configured(): boolean {
	const accountId = getEnvVar("R2_ACCOUNT_ID");
	const accessKeyId = getEnvVar("R2_ACCESS_KEY_ID");
	const secretAccessKey = getEnvVar("R2_SECRET_ACCESS_KEY");
	const bucket = getEnvVar("R2_BUCKET_NAME");
	return Boolean(accountId && accessKeyId && secretAccessKey && bucket);
}

export function getBucketName(): string {
	return getEnvVar("R2_BUCKET_NAME") || "loom-recordings";
}

/**
 * Generates a presigned PUT URL for direct browser-to-R2 upload.
 */
export async function createPresignedUploadUrl(
	key: string,
	contentType = "video/webm",
	expiresIn = 1800, // 30 minutes
): Promise<string> {
	if (!isR2Configured()) {
		// Local development fallback
		return `/api/loom/local-upload?key=${encodeURIComponent(key)}`;
	}

	const client = getR2Client();
	const command = new PutObjectCommand({
		Bucket: getBucketName(),
		Key: key,
		ContentType: contentType,
	});

	return await getSignedUrl(client, command, { expiresIn });
}

/**
 * Resolves the public streaming URL for a video.
 * Uses public CDN domain if configured, or generates a presigned GET URL.
 */
export async function getVideoPublicUrl(key: string, expiresIn = 86400): Promise<string> {
	const publicBaseUrl = getEnvVar("R2_PUBLIC_URL");
	if (publicBaseUrl) {
		const base = publicBaseUrl.endsWith("/") ? publicBaseUrl.slice(0, -1) : publicBaseUrl;
		const cleanKey = key.startsWith("/") ? key.slice(1) : key;
		return `${base}/${cleanKey}`;
	}

	if (!isR2Configured()) {
		return `/api/loom/local-media?key=${encodeURIComponent(key)}`;
	}

	const client = getR2Client();
	const command = new GetObjectCommand({
		Bucket: getBucketName(),
		Key: key,
	});

	return await getSignedUrl(client, command, { expiresIn });
}

export async function deleteVideoFile(key: string): Promise<void> {
	if (!isR2Configured()) {
		try {
			const baseDir = path.resolve(process.cwd(), "public/loom-uploads");
			const sanitizedSubpath = path.normalize(key).replace(/^(\.\.[\/\\])+/, "");
			const filePath = path.resolve(baseDir, sanitizedSubpath);
			if (filePath.startsWith(baseDir + path.sep)) {
				await fs.unlink(filePath);
			}
		} catch (err) {
			console.warn("Could not delete local file:", err);
		}
		return;
	}

	try {
		const client = getR2Client();
		await client.send(
			new DeleteObjectCommand({
				Bucket: getBucketName(),
				Key: key,
			}),
		);
	} catch (err) {
		console.error("Failed to delete object from R2:", err);
	}
}
