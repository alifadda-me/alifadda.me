import React, { useRef, useState, useEffect } from "react";

export interface Chapter {
	time: number;
	title: string;
}

export interface Segment {
	start: number;
	end: number;
	text: string;
}

export interface CommentIndicator {
	id: string;
	timestamp_seconds: number;
	author_name: string;
	body: string;
	emoji_reaction: string | null;
}

interface VideoPlayerProps {
	videoUrl: string;
	title: string;
	durationSeconds?: number;
	chapters?: Chapter[];
	segments?: Segment[];
	comments?: CommentIndicator[];
	aiSummary?: string | null;
	onTimeUpdateExternal?: (currentTime: number) => void;
	seekTarget?: number | null;
}

export default function VideoPlayer({
	videoUrl,
	title,
	durationSeconds = 0,
	chapters = [],
	segments = [],
	comments = [],
	aiSummary = null,
	onTimeUpdateExternal,
	seekTarget,
}: VideoPlayerProps) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [isPlaying, setIsPlaying] = useState<boolean>(false);
	const [currentTime, setCurrentTime] = useState<number>(0);
	const [duration, setDuration] = useState<number>(durationSeconds);
	const [isMuted, setIsMuted] = useState<boolean>(false);
	const [playbackRate, setPlaybackRate] = useState<number>(1);
	const [activeTab, setActiveTab] = useState<"chapters" | "summary" | "transcript">(
		chapters.length > 0 ? "chapters" : aiSummary ? "summary" : "transcript",
	);
	const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
	const playerContainerRef = useRef<HTMLDivElement | null>(null);

	// Sync fullscreen state
	useEffect(() => {
		const handleFsChange = () => {
			setIsFullscreen(Boolean(document.fullscreenElement));
		};
		document.addEventListener("fullscreenchange", handleFsChange);
		return () => document.removeEventListener("fullscreenchange", handleFsChange);
	}, []);

	// Handle external seek requests (e.g. clicking a comment timestamp)
	useEffect(() => {
		if (seekTarget !== null && seekTarget !== undefined && videoRef.current) {
			videoRef.current.currentTime = seekTarget;
			videoRef.current.play().catch(() => {});
			setIsPlaying(true);
		}
	}, [seekTarget]);

	const formatTime = (timeInSeconds: number) => {
		const total = Math.floor(timeInSeconds);
		const mins = Math.floor(total / 60);
		const secs = total % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const togglePlay = () => {
		if (!videoRef.current) return;
		if (videoRef.current.paused) {
			videoRef.current.play().catch(() => {});
			setIsPlaying(true);
		} else {
			videoRef.current.pause();
			setIsPlaying(false);
		}
	};

	const handleTimeUpdate = () => {
		if (!videoRef.current) return;
		const cur = videoRef.current.currentTime;
		setCurrentTime(cur);
		if (onTimeUpdateExternal) {
			onTimeUpdateExternal(cur);
		}
	};

	const handleLoadedMetadata = () => {
		if (videoRef.current) {
			const dur = videoRef.current.duration;
			if (dur && isFinite(dur)) {
				setDuration(dur);
			}
		}
	};

	const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
		const targetSec = parseFloat(e.target.value);
		if (videoRef.current) {
			videoRef.current.currentTime = targetSec;
			setCurrentTime(targetSec);
		}
	};

	const seekTo = (seconds: number) => {
		if (videoRef.current) {
			videoRef.current.currentTime = seconds;
			videoRef.current.play().catch(() => {});
			setIsPlaying(true);
		}
	};

	const changeSpeed = () => {
		const speeds = [1, 1.25, 1.5, 2];
		const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
		const nextSpeed = speeds[nextIdx] || 1;
		setPlaybackRate(nextSpeed);
		if (videoRef.current) {
			videoRef.current.playbackRate = nextSpeed;
		}
	};

	const toggleMute = () => {
		if (!videoRef.current) return;
		const nextMuted = !isMuted;
		videoRef.current.muted = nextMuted;
		setIsMuted(nextMuted);
	};

	const toggleFullscreen = () => {
		if (!playerContainerRef.current) return;
		if (!document.fullscreenElement) {
			if (playerContainerRef.current.requestFullscreen) {
				playerContainerRef.current.requestFullscreen().catch(() => {});
			} else if (
				(videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void })
					?.webkitEnterFullscreen
			) {
				(
					videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
				).webkitEnterFullscreen?.();
			}
			setIsFullscreen(true);
		} else {
			if (document.exitFullscreen) {
				document.exitFullscreen().catch(() => {});
			}
			setIsFullscreen(false);
		}
	};

	const [showControls, setShowControls] = useState<boolean>(true);
	const controlsTimeoutRef = useRef<number | null>(null);

	const resetControlsTimeout = () => {
		setShowControls(true);
		if (controlsTimeoutRef.current) {
			clearTimeout(controlsTimeoutRef.current);
		}
		if (isPlaying) {
			controlsTimeoutRef.current = window.setTimeout(() => {
				setShowControls(false);
			}, 3000);
		}
	};

	useEffect(() => {
		resetControlsTimeout();
		return () => {
			if (controlsTimeoutRef.current) {
				clearTimeout(controlsTimeoutRef.current);
			}
		};
	}, [isPlaying]);

	const effectiveDuration = duration > 0 ? duration : 1;

	return (
		<div className="w-full space-y-4">
			<style>{`
				.loom-player-container:fullscreen {
					width: 100vw !important;
					height: 100vh !important;
					max-width: 100vw !important;
					max-height: 100vh !important;
					border-radius: 0 !important;
					border: none !important;
					background-color: #000 !important;
					display: flex !important;
					align-items: center !important;
					justify-content: center !important;
				}
				.loom-player-container:fullscreen video {
					width: 100% !important;
					height: 100% !important;
					max-height: 100vh !important;
					object-fit: contain !important;
				}
			`}</style>

			{/* Video Player Container */}
			<div
				ref={playerContainerRef}
				onMouseMove={resetControlsTimeout}
				onTouchStart={resetControlsTimeout}
				onMouseLeave={() => {
					if (isPlaying) setShowControls(false);
				}}
				className={`loom-player-container relative overflow-hidden bg-black shadow-2xl group select-none transition-all ${
					isFullscreen
						? "fixed inset-0 w-screen h-screen z-50 rounded-none border-0 flex items-center justify-center"
						: "rounded-xl border border-neutral-800 aspect-video w-full flex items-center justify-center"
				}`}
			>
				{title && (
					<div
						className={`absolute top-3 left-3 z-30 px-2.5 py-1 rounded bg-black/70 backdrop-blur-md text-[11px] font-mono text-neutral-300 pointer-events-none transition-opacity truncate max-w-[80%] border border-neutral-800 ${
							showControls || !isPlaying ? "opacity-100" : "opacity-0"
						}`}
					>
						{title}
					</div>
				)}

				<video
					ref={videoRef}
					src={videoUrl}
					onTimeUpdate={handleTimeUpdate}
					onLoadedMetadata={handleLoadedMetadata}
					onPlay={() => setIsPlaying(true)}
					onPause={() => setIsPlaying(false)}
					onClick={togglePlay}
					onDoubleClick={toggleFullscreen}
					playsInline
					className={`w-full h-full object-contain cursor-pointer ${
						isFullscreen && !showControls && isPlaying ? "cursor-none" : ""
					}`}
				/>

				{/* Big Center Play Overlay when Paused */}
				{!isPlaying && (
					<div
						onClick={togglePlay}
						onDoubleClick={toggleFullscreen}
						className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition-opacity cursor-pointer z-20"
					>
						<div className="h-16 w-16 rounded-full bg-emerald-500/90 flex items-center justify-center text-neutral-950 shadow-xl pl-1 hover:scale-105 transition-transform">
							<svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
								<path d="M8 5v14l11-7z" />
							</svg>
						</div>
					</div>
				)}

				{/* Player Controls Bar - Pinned to the bottom as an overlay with zero dead space below */}
				<div
					onClick={(e) => e.stopPropagation()}
					className={`absolute bottom-0 inset-x-0 z-30 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent transition-opacity duration-300 ${
						showControls || !isPlaying ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
					}`}
					style={{
						paddingBottom: isFullscreen
							? "max(1.25rem, env(safe-area-inset-bottom))"
							: "max(0.75rem, env(safe-area-inset-bottom))",
					}}
				>
					{/* Interactive Progress Bar with Chapter Markers & Comment Pins */}
					<div className="relative w-full mb-3 flex items-center">
						<input
							type="range"
							min="0"
							max={effectiveDuration}
							step="0.1"
							value={currentTime}
							onChange={handleSeek}
							className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-400 z-10"
						/>

						{/* Chapter Marker Notches */}
						{chapters.map((ch, idx) => {
							const markerPercent = (ch.time / effectiveDuration) * 100;
							if (markerPercent < 0 || markerPercent > 100) return null;
							return (
								<div
									key={idx}
									title={`Chapter: ${ch.title} (${formatTime(ch.time)})`}
									style={{ left: `${markerPercent}%` }}
									className="absolute top-1/2 -translate-y-1/2 h-3 w-1 bg-amber-400/90 rounded-sm pointer-events-none z-20"
								/>
							);
						})}

						{/* Comment Pins */}
						{comments.map((cm) => {
							const commentPercent = (cm.timestamp_seconds / effectiveDuration) * 100;
							if (commentPercent < 0 || commentPercent > 100) return null;
							return (
								<div
									key={cm.id}
									title={`Comment by ${cm.author_name}: "${cm.body}"`}
									style={{ left: `${commentPercent}%` }}
									className="absolute -top-1 h-2 w-2 rounded-full bg-cyan-400 ring-2 ring-neutral-950 pointer-events-none z-30 transform -translate-x-1"
								/>
							);
						})}
					</div>

					{/* Control Buttons */}
					<div className="flex items-center justify-between text-neutral-200 text-xs font-mono">
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={togglePlay}
								className="p-1.5 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
								title={isPlaying ? "Pause" : "Play"}
							>
								{isPlaying ? (
									<svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
										<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
									</svg>
								) : (
									<svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
										<path d="M8 5v14l11-7z" />
									</svg>
								)}
							</button>

							<button
								type="button"
								onClick={toggleMute}
								className="p-1.5 rounded hover:bg-neutral-800 transition-colors cursor-pointer"
								title={isMuted ? "Unmute" : "Mute"}
							>
								{isMuted ? (
									<svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
										<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
									</svg>
								) : (
									<svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
										<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
									</svg>
								)}
							</button>

							<span className="text-neutral-400">
								{formatTime(currentTime)} / {formatTime(duration)}
							</span>
						</div>

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={changeSpeed}
								className="px-2 py-1 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[11px] font-bold text-neutral-300 transition-colors cursor-pointer"
								title="Playback speed"
							>
								{playbackRate}x
							</button>

							<button
								type="button"
								onClick={toggleFullscreen}
								className="p-1.5 rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition-colors cursor-pointer"
								title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
							>
								{isFullscreen ? (
									<svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
										<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
									</svg>
								) : (
									<svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
										<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
									</svg>
								)}
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* Chapters & Interactive Transcript Bar */}
			{/* Chapters, AI Summary & Interactive Transcript Bar */}
			{(chapters.length > 0 || segments.length > 0 || Boolean(aiSummary)) && (
				<div className="rounded-xl border border-global-text/15 bg-global-bg p-4 font-mono text-global-text shadow-sm">
					{/* Tabs in Order: Chapters -> AI Summary -> Transcript */}
					<div className="flex items-center gap-4 border-b border-global-text/10 pb-2 mb-3">
						{chapters.length > 0 && (
							<button
								type="button"
								onClick={() => setActiveTab("chapters")}
								className={`text-xs uppercase font-semibold tracking-wider pb-1 transition-colors cursor-pointer ${
									activeTab === "chapters"
										? "border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold"
										: "text-global-text/60 hover:text-global-text"
								}`}
							>
								Chapters ({chapters.length})
							</button>
						)}

						{aiSummary && (
							<button
								type="button"
								onClick={() => setActiveTab("summary")}
								className={`text-xs uppercase font-semibold tracking-wider pb-1 transition-colors cursor-pointer flex items-center gap-1.5 ${
									activeTab === "summary"
										? "border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold"
										: "text-global-text/60 hover:text-global-text"
								}`}
							>
								<span>✨</span>
								<span>AI Summary</span>
							</button>
						)}

						{segments.length > 0 && (
							<button
								type="button"
								onClick={() => setActiveTab("transcript")}
								className={`text-xs uppercase font-semibold tracking-wider pb-1 transition-colors cursor-pointer ${
									activeTab === "transcript"
										? "border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold"
										: "text-global-text/60 hover:text-global-text"
								}`}
							>
								Transcript
							</button>
						)}
					</div>

					{/* Chapter List */}
					{activeTab === "chapters" && chapters.length > 0 && (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
							{chapters.map((ch, idx) => {
								const isCurrent =
									currentTime >= ch.time &&
									(idx === chapters.length - 1 || currentTime < chapters[idx + 1]!.time);

								return (
									<button
										key={idx}
										type="button"
										onClick={() => seekTo(ch.time)}
										className={`flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
											isCurrent
												? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-medium"
												: "bg-global-text/5 border border-global-text/10 text-global-text/85 hover:bg-global-text/10"
										}`}
									>
										<span className="truncate pr-2 font-medium">{ch.title}</span>
										<span className="font-mono text-[10px] text-global-text/70 bg-global-text/10 px-1.5 py-0.5 rounded">
											{formatTime(ch.time)}
										</span>
									</button>
								);
							})}
						</div>
					)}

					{/* AI Summary Tab Panel */}
					{activeTab === "summary" && aiSummary && (
						<div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
							<div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider">
								<span>✨</span>
								<span>Key Takeaways & Summary</span>
							</div>
							<div className="text-xs text-global-text/90 leading-relaxed space-y-2 whitespace-pre-wrap font-sans">
								{aiSummary}
							</div>
						</div>
					)}

					{/* Interactive Transcript */}
					{activeTab === "transcript" && segments.length > 0 && (
						<div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 text-xs">
							{segments.map((seg, idx) => {
								const isCurrent = currentTime >= seg.start && currentTime <= seg.end;
								return (
									<div
										key={idx}
										onClick={() => seekTo(seg.start)}
										className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors ${
											isCurrent
												? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
												: "text-global-text/80 hover:bg-global-text/5"
										}`}
									>
										<span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 shrink-0 pt-0.5 font-bold">
											{formatTime(seg.start)}
										</span>
										<p className="leading-relaxed">{seg.text}</p>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
