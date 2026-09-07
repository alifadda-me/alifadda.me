import React, { useState } from "react";
import VideoPlayer, { type Chapter, type Segment, type CommentIndicator } from "./VideoPlayer";
import CommentsSection from "./CommentsSection";
import type { CommentRecord } from "@/utils/db";

interface WatchExperienceProps {
	videoId: string;
	videoUrl: string;
	title: string;
	durationSeconds: number;
	chapters: Chapter[];
	segments: Segment[];
	initialComments: CommentRecord[];
	aiSummary?: string | null;
}

export default function WatchExperience({
	videoId,
	videoUrl,
	title,
	durationSeconds,
	chapters,
	segments,
	initialComments,
	aiSummary = null,
}: WatchExperienceProps) {
	const [currentTime, setCurrentTime] = useState<number>(0);
	const [seekTarget, setSeekTarget] = useState<number | null>(null);

	const commentIndicators: CommentIndicator[] = initialComments.map((c) => ({
		id: c.id,
		timestamp_seconds: c.timestamp_seconds,
		author_name: c.author_name,
		body: c.body,
		emoji_reaction: c.emoji_reaction,
	}));

	const handleSeekToTime = (time: number) => {
		setSeekTarget(time);
		// Reset seekTarget so future clicks on the same timestamp work
		setTimeout(() => setSeekTarget(null), 100);
	};

	return (
		<div className="space-y-6">
			{/* Video Player Component (with integrated Chapters, AI Summary, and Transcript) */}
			<VideoPlayer
				videoUrl={videoUrl}
				title={title}
				durationSeconds={durationSeconds}
				chapters={chapters}
				segments={segments}
				comments={commentIndicators}
				aiSummary={aiSummary}
				onTimeUpdateExternal={setCurrentTime}
				seekTarget={seekTarget}
			/>

			{/* Generous Spacing for Discussion / Comments Section */}
			<div className="pt-8 mt-12 border-t border-global-text/15">
				<CommentsSection
					videoId={videoId}
					initialComments={initialComments}
					currentVideoTime={currentTime}
					onSeekToTime={handleSeekToTime}
				/>
			</div>
		</div>
	);
}
