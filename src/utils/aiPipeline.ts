import OpenAI from "openai";
import { saveAiMetadata, updateVideoStatus } from "./db";
import { getEnvVar } from "./auth";

export async function processVideoAI(
	videoId: string,
	videoFileUrl: string,
	customTitle?: string,
): Promise<void> {
	const apiKey = getEnvVar("OPENAI_API_KEY");

	if (!apiKey) {
		console.warn(`[AI Pipeline] OPENAI_API_KEY not configured. Skipping AI enrichment for video ${videoId}.`);
		await updateVideoStatus(videoId, "ready", customTitle?.trim() || "Recorded Video");
		return;
	}

	const openai = new OpenAI({ apiKey });

	try {
		console.log(`[AI Pipeline] Fetching video file for video ${videoId}: ${videoFileUrl}`);
		const response = await fetch(videoFileUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch video stream: ${response.status} ${response.statusText}`);
		}

		const audioBlob = await response.blob();
		const isMp4 = videoFileUrl.toLowerCase().includes(".mp4") || audioBlob.type.toLowerCase().includes("mp4");
		const fileName = isMp4 ? "audio.mp4" : "audio.webm";
		const fileType = isMp4 ? "video/mp4" : "video/webm";
		const file = new File([audioBlob], fileName, { type: fileType });

		// 1. Whisper Transcription
		console.log(`[AI Pipeline] Transcribing audio with Whisper for video ${videoId} (${fileName}, ${audioBlob.size} bytes)...`);
		const transcription = await openai.audio.transcriptions.create({
			file,
			model: "whisper-1",
			response_format: "verbose_json",
			timestamp_granularities: ["segment"],
		});

		const rawTranscript = transcription.text || "";
		// transcription.segments has shape [{ start, end, text }, ...]
		const segments = "segments" in transcription ? (transcription as unknown as { segments: unknown[] }).segments : [];

		// 2. LLM Summarization & Chapter Extraction
		console.log(`[AI Pipeline] Extracting summary and chapters with gpt-4o-mini...`);
		const llmPrompt = `
Analyze the transcript below from an async Loom video recording and return JSON with this exact structure:
{
  "title": "Clear concise video title",
  "summary": "Markdown bulleted summary of key highlights and insights",
  "chapters": [
    { "time": 0, "title": "Intro" }
  ]
}

Ensure "time" in chapters is the starting integer timestamp in seconds corresponding to the topic switch.

Transcript:
"${rawTranscript}"`;

		const llmResult = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			response_format: { type: "json_object" },
			messages: [{ role: "user", content: llmPrompt }],
		});

		const parsed = JSON.parse(llmResult.choices[0]?.message.content || "{}");

		// 3. Save to Database
		await saveAiMetadata({
			video_id: videoId,
			summary: parsed.summary || "No summary generated.",
			raw_transcript: rawTranscript,
			chapters_json: JSON.stringify(parsed.chapters || [{ time: 0, title: "Recording" }]),
			segments_json: JSON.stringify(segments),
		});

		// Preserve custom user-provided title if available; otherwise use AI-generated title
		const finalTitle =
			customTitle && customTitle.trim() && customTitle.trim() !== "Untitled Recording"
				? customTitle.trim()
				: parsed.title || "Recorded Video";

		await updateVideoStatus(videoId, "ready", finalTitle);

		console.log(`[AI Pipeline] AI enrichment successfully completed for video ${videoId}`);
	} catch (error) {
		console.error(`[AI Pipeline] AI Enrichment Failed for video ${videoId}:`, error);
		await updateVideoStatus(videoId, "ready", customTitle?.trim() || "Recorded Video");
	}
}
