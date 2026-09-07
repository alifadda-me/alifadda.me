import { createClient, type Client } from "@libsql/client";

export interface VideoRecord {
	id: string;
	title: string;
	storage_path: string;
	duration_seconds: number;
	status: "processing" | "ready" | "failed";
	created_at: string;
}

export interface VideoAiMetadataRecord {
	video_id: string;
	summary: string | null;
	raw_transcript: string | null;
	chapters_json: string | null;
	segments_json: string | null;
}

export interface CommentRecord {
	id: string;
	video_id: string;
	author_name: string;
	timestamp_seconds: number;
	body: string;
	emoji_reaction: string | null;
	created_at: string;
}

const dbUrl = process.env.TURSO_DATABASE_URL || "file:local_loom.db";
const dbAuthToken = process.env.TURSO_AUTH_TOKEN;

export const db: Client = createClient(
	dbAuthToken ? { url: dbUrl, authToken: dbAuthToken } : { url: dbUrl },
);

let isInitialized = false;

export async function ensureDbInitialized(): Promise<void> {
	if (isInitialized) return;

	try {
		await db.execute(`
			CREATE TABLE IF NOT EXISTS videos (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL DEFAULT 'Untitled Recording',
				storage_path TEXT NOT NULL,
				duration_seconds INTEGER DEFAULT 0,
				status TEXT NOT NULL DEFAULT 'processing',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
		`);

		await db.execute(`
			CREATE TABLE IF NOT EXISTS video_ai_metadata (
				video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
				summary TEXT,
				raw_transcript TEXT,
				chapters_json TEXT,
				segments_json TEXT
			);
		`);

		await db.execute(`
			CREATE TABLE IF NOT EXISTS comments (
				id TEXT PRIMARY KEY,
				video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
				author_name TEXT NOT NULL DEFAULT 'Anonymous',
				timestamp_seconds INTEGER NOT NULL,
				body TEXT NOT NULL,
				emoji_reaction TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
		`);

		await db.execute(`
			CREATE INDEX IF NOT EXISTS idx_comments_video_time ON comments(video_id, timestamp_seconds);
		`);

		isInitialized = true;
	} catch (error) {
		console.error("Database schema initialization failed:", error);
	}
}

export async function getVideo(id: string): Promise<VideoRecord | null> {
	await ensureDbInitialized();
	const res = await db.execute({
		sql: "SELECT * FROM videos WHERE id = ? LIMIT 1",
		args: [id],
	});
	if (!res.rows.length) return null;
	return res.rows[0] as unknown as VideoRecord;
}

export async function listVideos(limit = 50): Promise<VideoRecord[]> {
	await ensureDbInitialized();
	const res = await db.execute({
		sql: "SELECT * FROM videos ORDER BY created_at DESC LIMIT ?",
		args: [limit],
	});
	return res.rows as unknown as VideoRecord[];
}

export async function deleteVideo(id: string): Promise<void> {
	await ensureDbInitialized();
	await db.execute({ sql: "DELETE FROM comments WHERE video_id = ?", args: [id] });
	await db.execute({ sql: "DELETE FROM video_ai_metadata WHERE video_id = ?", args: [id] });
	await db.execute({ sql: "DELETE FROM videos WHERE id = ?", args: [id] });
}

export async function createVideo(video: {
	id: string;
	title?: string;
	storage_path: string;
	duration_seconds?: number;
	status?: string;
}): Promise<void> {
	await ensureDbInitialized();
	await db.execute({
		sql: `INSERT INTO videos (id, title, storage_path, duration_seconds, status)
		      VALUES (?, ?, ?, ?, ?)`,
		args: [
			video.id,
			video.title || "Untitled Recording",
			video.storage_path,
			video.duration_seconds || 0,
			video.status || "processing",
		],
	});
}

export async function updateVideoStatus(
	id: string,
	status: string,
	title?: string,
	duration_seconds?: number,
): Promise<void> {
	await ensureDbInitialized();
	if (title !== undefined && duration_seconds !== undefined) {
		await db.execute({
			sql: `UPDATE videos SET status = ?, title = ?, duration_seconds = ? WHERE id = ?`,
			args: [status, title, duration_seconds, id],
		});
	} else if (title !== undefined) {
		await db.execute({
			sql: `UPDATE videos SET status = ?, title = ? WHERE id = ?`,
			args: [status, title, id],
		});
	} else {
		await db.execute({
			sql: `UPDATE videos SET status = ? WHERE id = ?`,
			args: [status, id],
		});
	}
}

export async function getAiMetadata(videoId: string): Promise<VideoAiMetadataRecord | null> {
	await ensureDbInitialized();
	const res = await db.execute({
		sql: "SELECT * FROM video_ai_metadata WHERE video_id = ? LIMIT 1",
		args: [videoId],
	});
	if (!res.rows.length) return null;
	return res.rows[0] as unknown as VideoAiMetadataRecord;
}

export async function saveAiMetadata(meta: {
	video_id: string;
	summary: string;
	raw_transcript: string;
	chapters_json: string;
	segments_json: string;
}): Promise<void> {
	await ensureDbInitialized();
	await db.execute({
		sql: `INSERT OR REPLACE INTO video_ai_metadata 
		      (video_id, summary, raw_transcript, chapters_json, segments_json)
		      VALUES (?, ?, ?, ?, ?)`,
		args: [
			meta.video_id,
			meta.summary,
			meta.raw_transcript,
			meta.chapters_json,
			meta.segments_json,
		],
	});
}

export async function getComments(videoId: string): Promise<CommentRecord[]> {
	await ensureDbInitialized();
	const res = await db.execute({
		sql: "SELECT * FROM comments WHERE video_id = ? ORDER BY timestamp_seconds ASC, created_at ASC",
		args: [videoId],
	});
	return res.rows as unknown as CommentRecord[];
}

export async function createComment(comment: {
	id: string;
	video_id: string;
	author_name: string;
	timestamp_seconds: number;
	body: string;
	emoji_reaction?: string;
}): Promise<void> {
	await ensureDbInitialized();
	await db.execute({
		sql: `INSERT INTO comments (id, video_id, author_name, timestamp_seconds, body, emoji_reaction)
		      VALUES (?, ?, ?, ?, ?, ?)`,
		args: [
			comment.id,
			comment.video_id,
			comment.author_name || "Anonymous",
			comment.timestamp_seconds,
			comment.body,
			comment.emoji_reaction || null,
		],
	});
}
