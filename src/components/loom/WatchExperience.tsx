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
}

export default function WatchExperience({
	videoId,
	videoUrl,
	title,
	durationSeconds,
	chapters,
	segments,
	initialComments,
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
		<div className="space-y-8">
			{/* Video Player Component */}
			<VideoPlayer
				videoUrl={videoUrl}
				title={title}
				durationSeconds={durationSeconds}
				chapters={chapters}
				segments={segments}
				comments={commentIndicators}
				onTimeUpdateExternal={setCurrentTime}
				seekTarget={seekTarget}
			/>

			{/* Comments Section */}
			<CommentsSection
				videoId={videoId}
				initialComments={initialComments}
				currentVideoTime={currentTime}
				onSeekToTime={handleSeekToTime}
			/>
		</div>
	);
}
