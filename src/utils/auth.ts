import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function getEnvVar(keyName: string): string {
	// 1. In development, prioritize reading .env from disk so edits take effect immediately
	if (process.env.NODE_ENV !== "production") {
		try {
			const envPath = path.resolve(process.cwd(), ".env");
			if (fs.existsSync(envPath)) {
				const content = fs.readFileSync(envPath, "utf-8");
				for (const line of content.split("\n")) {
					const trimmed = line.trim();
					if (trimmed.startsWith(`${keyName}=`)) {
						const val = trimmed
							.slice(`${keyName}=`.length)
							.trim()
							.replace(/^["']|["']$/g, "");
						if (val) {
							process.env[keyName] = val;
							return val;
						}
					}
				}
			}
		} catch {
			// ignore
		}
	}

	// 2. Production / process environment variable
	if (process.env[keyName]) {
		return process.env[keyName]!.trim().replace(/^["']|["']$/g, "");
	}

	return "";
}

export function getRecordSecret(): string {
	return getEnvVar("RECORD_SECRET");
}

export function isAuthorized(providedKey: string | null | undefined): boolean {
	const secret = getRecordSecret();
	if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
		return false;
	}
	if (!providedKey || typeof providedKey !== "string" || providedKey.trim().length === 0) {
		return false;
	}

	const cleanSecret = secret.trim().replace(/^["']|["']$/g, "");
	const cleanProvided = providedKey.trim().replace(/^["']|["']$/g, "");

	// Constant-time SHA-256 comparison to prevent side-channel timing attacks
	const secretHash = new Uint8Array(crypto.createHash("sha256").update(cleanSecret).digest());
	const providedHash = new Uint8Array(crypto.createHash("sha256").update(cleanProvided).digest());

	return crypto.timingSafeEqual(secretHash, providedHash);
}

