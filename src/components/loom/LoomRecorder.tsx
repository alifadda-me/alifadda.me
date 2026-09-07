import React, { useState, useEffect, useRef } from "react";
import { LoomCaptureEngine, type CaptureMode, type CameraFacing } from "@/utils/loomCapture";

interface LoomRecorderProps {
	initialKey?: string;
}

type RecordingPhase = "auth" | "preview" | "countdown" | "recording" | "uploading" | "done" | "error";

export default function LoomRecorder({ initialKey = "" }: LoomRecorderProps) {
	const [recordKey, setRecordKey] = useState<string>(initialKey);
	const [phase, setPhase] = useState<RecordingPhase>("auth");
	const [isValidating, setIsValidating] = useState<boolean>(Boolean(initialKey));
	const [errorMessage, setErrorMessage] = useState<string>("");
	const [countdown, setCountdown] = useState<number>(3);
	const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
	const [isPaused, setIsPaused] = useState<boolean>(false);
	const [isStarting, setIsStarting] = useState<boolean>(false);

	// Mode state (Defaulting to Camera for mobile-first)
	const [captureMode, setCaptureMode] = useState<CaptureMode>("camera");
	const [facingMode, setFacingMode] = useState<CameraFacing>("user");
	const [enableMic, setEnableMic] = useState<boolean>(true);
	const [hasMicTrack, setHasMicTrack] = useState<boolean | null>(null);
	const [isRequestingMic, setIsRequestingMic] = useState<boolean>(false);
	const [micNotice, setMicNotice] = useState<string | null>(null);
	const [showNoAudioConfirm, setShowNoAudioConfirm] = useState<boolean>(false);
	const [videoTitle, setVideoTitle] = useState<string>("");
	const [uploadProgress, setUploadProgress] = useState<number>(0);
	const [createdVideoId, setCreatedVideoId] = useState<string>("");

	// Video and capture engine state
	const captureEngineRef = useRef<LoomCaptureEngine | null>(null);
	const timerIntervalRef = useRef<number | null>(null);
	const countdownIntervalRef = useRef<number | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const previewStreamRef = useRef<MediaStream | null>(null);
	const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
	const [hasDisplayMediaSupport, setHasDisplayMediaSupport] = useState<boolean>(true);
	const lastRecordedRef = useRef<{ blob: Blob; durationSeconds: number; mimeType: string; hasAudio: boolean } | null>(null);

	useEffect(() => {
		if (typeof navigator !== "undefined") {
			setHasDisplayMediaSupport(Boolean(navigator.mediaDevices?.getDisplayMedia));
		}
	}, []);

	// Never save RECORD_SECRET: purge any previous storage on mount and require fresh auth
	useEffect(() => {
		if (typeof window !== "undefined") {
			window.localStorage.removeItem("loom_record_key");
			document.cookie = "loom_admin_key=; path=/; max-age=0; SameSite=Lax";
			if (window.location.search.includes("key=")) {
				window.history.replaceState({}, "", window.location.pathname);
			}
		}

		let isMounted = true;

		const verifyCandidateKey = async (candidate: string) => {
			try {
				const res = await fetch("/api/loom/verify", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Record-Key": candidate.trim(),
					},
				});

				if (!isMounted) return;

				if (res.ok) {
					setRecordKey(candidate.trim());
					setPhase("preview");
				} else {
					setPhase("auth");
				}
			} catch {
				if (isMounted) setPhase("auth");
			} finally {
				if (isMounted) setIsValidating(false);
			}
		};

		if (typeof window !== "undefined") {
			const params = new URLSearchParams(window.location.search);
			const urlKey = params.get("key") || "";
			const candidate = urlKey || initialKey;

			if (candidate) {
				verifyCandidateKey(candidate);
			} else {
				setPhase("auth");
				setIsValidating(false);
			}
		} else {
			setIsValidating(false);
		}

		return () => {
			isMounted = false;
		};
	}, [initialKey]);

	// Camera and microphone preview setup for preview phase (requests both together in one prompt)
	useEffect(() => {
		let isMounted = true;

		if (phase === "preview") {
			if (captureMode === "camera" || captureMode === "screen_with_camera") {
				const hasLiveVideo = previewStreamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
				// If we don't already have live video tracks, acquire camera and microphone
				if (!hasLiveVideo) {
					const videoConstraints = {
						facingMode: { ideal: facingMode },
						width: { ideal: 1280 },
						height: { ideal: 720 },
					};

					const setupMedia = async () => {
						let stream: MediaStream | null = null;
						let micFound = false;

						try {
							// Request camera + mic together in a single browser prompt
							stream = await navigator.mediaDevices.getUserMedia({
								video: videoConstraints,
								audio: true,
							});
							micFound = stream.getAudioTracks().length > 0;
						} catch (camMicErr) {
							console.warn("Combined camera + mic preview failed, falling back to camera only:", camMicErr);
							try {
								// Fallback to camera only if microphone access is denied
								stream = await navigator.mediaDevices.getUserMedia({
									video: videoConstraints,
									audio: false,
								});
							} catch (err) {
								console.warn("Camera preview not accessible:", err);
							}
						}

						if (!isMounted || !stream) {
							stream?.getTracks().forEach((t) => t.stop());
							return;
						}

						if (previewStreamRef.current && previewStreamRef.current !== stream) {
							previewStreamRef.current.getTracks().forEach((t) => t.stop());
						}

						if (micFound) {
							setHasMicTrack(true);
							setMicNotice(null);
							// Apply initial microphone state
							stream.getAudioTracks().forEach((t) => {
								t.enabled = enableMic;
							});
						} else {
							setHasMicTrack(false);
							setMicNotice("Microphone is not active. Tap 'Enable Mic' below or grant mic permissions.");
						}

						previewStreamRef.current = stream;
						setActiveStream(stream);
					};

					setupMedia();
				}
			} else {
				// Screen mode
				if (previewStreamRef.current) {
					previewStreamRef.current.getTracks().forEach((t) => t.stop());
					previewStreamRef.current = null;
				}
				setActiveStream(null);
			}
		}

		return () => {
			isMounted = false;
			// DO NOT stop previewStreamRef tracks here because moving to "countdown" or "recording"
			// reuses these active tracks! Teardown happens on unmount or cancel.
		};
	}, [phase, captureMode, facingMode]);

	// Sync microphone checkbox directly to live audio track
	useEffect(() => {
		if (previewStreamRef.current) {
			previewStreamRef.current.getAudioTracks().forEach((t) => {
				t.enabled = enableMic;
			});
		}
	}, [enableMic]);

	// Full stream teardown only when component unmounts
	useEffect(() => {
		return () => {
			if (previewStreamRef.current) {
				previewStreamRef.current.getTracks().forEach((t) => t.stop());
				previewStreamRef.current = null;
			}
			captureEngineRef.current?.cancel();
		};
	}, []);

	// Ensure video element always binds and plays active stream
	useEffect(() => {
		if (videoRef.current && activeStream) {
			if (videoRef.current.srcObject !== activeStream) {
				videoRef.current.srcObject = activeStream;
			}
			videoRef.current.muted = true;
			videoRef.current.play().catch((err) => {
				console.warn("Video playback issue:", err);
			});
		}
	}, [activeStream, phase]);

	const formatTime = (totalSeconds: number) => {
		const mins = Math.floor(totalSeconds / 60);
		const secs = totalSeconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const handleKeySubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const candidate = recordKey.trim();
		if (!candidate) {
			setErrorMessage("Please enter your RECORD_SECRET key.");
			return;
		}

		setErrorMessage("");
		setIsValidating(true);

		try {
			const res = await fetch("/api/loom/verify", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Record-Key": candidate,
				},
			});

			if (!res.ok) {
				setErrorMessage("Access Denied: Invalid RECORD_SECRET key.");
				setPhase("auth");
				setIsValidating(false);
				return;
			}

			// Validated successfully: keep in component memory state ONLY (never saved)
			setRecordKey(candidate);
			setPhase("preview");
		} catch {
			setErrorMessage("Connection error: Unable to verify key with server.");
			setPhase("auth");
		} finally {
			setIsValidating(false);
		}
	};

	const toggleFacingMode = () => {
		setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
	};

	const requestMicrophonePermission = async (): Promise<boolean> => {
		setIsRequestingMic(true);
		setMicNotice(null);

		try {
			const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const newAudioTrack = micStream.getAudioTracks()[0];

			if (newAudioTrack && previewStreamRef.current) {
				// Clean up any stale audio tracks
				previewStreamRef.current.getAudioTracks().forEach((t) => {
					previewStreamRef.current?.removeTrack(t);
					t.stop();
				});

				previewStreamRef.current.addTrack(newAudioTrack);
				newAudioTrack.enabled = true;
				setHasMicTrack(true);
				setEnableMic(true);
				setMicNotice(null);
				setShowNoAudioConfirm(false);
				setIsRequestingMic(false);
				return true;
			}
			setIsRequestingMic(false);
			return false;
		} catch (err: unknown) {
			console.warn("Microphone request failed:", err);
			setHasMicTrack(false);
			setIsRequestingMic(false);
			const errName = err instanceof Error ? err.name : "";
			if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
				setMicNotice(
					"Microphone is blocked in browser settings. On iPhone: open Settings > Chrome > toggle Microphone ON, then tap Enable Mic again.",
				);
			} else {
				setMicNotice("Microphone unavailable on this device. You can record video without audio.");
			}
			return false;
		}
	};

	const handleToggleMic = async () => {
		if (!enableMic) {
			// Turning microphone ON
			const liveAudio = previewStreamRef.current?.getAudioTracks().find((t) => t.readyState === "live");
			if (liveAudio) {
				liveAudio.enabled = true;
				setEnableMic(true);
			} else {
				// Request in this user click gesture
				const granted = await requestMicrophonePermission();
				if (!granted) {
					setEnableMic(false);
				}
			}
		} else {
			// Turning microphone OFF
			previewStreamRef.current?.getAudioTracks().forEach((t) => {
				t.enabled = false;
			});
			setEnableMic(false);
		}
	};

	const startRecordingWorkflow = async (forceNoAudio = false) => {
		try {
			setIsStarting(true);
			setErrorMessage("");

			// If microphone is enabled but stream lacks a live audio track, attempt user-gesture permission
			const liveAudio = previewStreamRef.current?.getAudioTracks().find((t) => t.readyState === "live");
			if (enableMic && !liveAudio && !forceNoAudio && captureMode === "camera") {
				const granted = await requestMicrophonePermission();
				if (!granted) {
					setIsStarting(false);
					setShowNoAudioConfirm(true);
					return;
				}
			}

			setShowNoAudioConfirm(false);

			const engine = new LoomCaptureEngine();
			captureEngineRef.current = engine;

			// 1. Prepare stream (reusing preview camera if active to prevent iOS WebKit device lockup)
			const stream = await engine.prepare({
				mode: captureMode,
				facingMode,
				enableMic: forceNoAudio ? false : enableMic,
				enableScreenAudio: true,
				existingStream: captureMode === "camera" ? previewStreamRef.current : null,
			});

			// If screen capture was selected, release camera preview and bind screen stream
			if (captureMode !== "camera") {
				if (previewStreamRef.current) {
					previewStreamRef.current.getTracks().forEach((t) => t.stop());
					previewStreamRef.current = null;
				}
				setActiveStream(stream);
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					videoRef.current.muted = true;
					videoRef.current.play().catch(() => {});
				}
			}

			// 2. Start countdown overlay
			setPhase("countdown");
			setCountdown(3);
			setIsStarting(false);

			let count = 3;
			if (countdownIntervalRef.current) {
				clearInterval(countdownIntervalRef.current);
			}

			countdownIntervalRef.current = window.setInterval(() => {
				count -= 1;
				if (count > 0) {
					setCountdown(count);
				} else {
					if (countdownIntervalRef.current) {
						clearInterval(countdownIntervalRef.current);
						countdownIntervalRef.current = null;
					}

					// 4. Begin actual recording!
					try {
						engine.beginRecording();
						setPhase("recording");
						setElapsedSeconds(0);
						setIsPaused(false);

						timerIntervalRef.current = window.setInterval(() => {
							setElapsedSeconds(engine.getDuration());
						}, 500);
					} catch (beginErr) {
						console.error("Failed to begin recording:", beginErr);
						setErrorMessage("Failed to start media recorder.");
						setPhase("error");
					}
				}
			}, 1000);
		} catch (err: unknown) {
			console.error("Recording setup error:", err);
			setErrorMessage(err instanceof Error ? err.message : "Failed to prepare capture stream.");
			setPhase("preview");
		} finally {
			setIsStarting(false);
		}
	};

	const handlePauseResume = () => {
		const engine = captureEngineRef.current;
		if (!engine) return;

		if (isPaused) {
			engine.resume();
			setIsPaused(false);
		} else {
			engine.pause();
			setIsPaused(true);
		}
	};

	const handleCancel = () => {
		if (timerIntervalRef.current) {
			clearInterval(timerIntervalRef.current);
			timerIntervalRef.current = null;
		}
		if (countdownIntervalRef.current) {
			clearInterval(countdownIntervalRef.current);
			countdownIntervalRef.current = null;
		}
		captureEngineRef.current?.cancel();
		captureEngineRef.current = null;
		setActiveStream(null);
		setPhase("preview");
		setElapsedSeconds(0);
	};

	const uploadVideoBlob = async (blob: Blob, durationSeconds: number, mimeType: string, hasAudio = true) => {
		setPhase("uploading");
		setUploadProgress(20);

		// 1. Request Presigned Upload URL with user-chosen title and accurate detected MIME type
		const detectedMime = mimeType || blob.type || "video/webm";
		const initRes = await fetch("/api/loom/upload-url", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Record-Key": recordKey,
			},
			body: JSON.stringify({
				title: videoTitle.trim() || undefined,
				mimeType: detectedMime,
			}),
		});

		if (!initRes.ok) {
			const errorData = await initRes.json().catch(() => ({}));
			throw new Error(errorData.error || "Failed to initialize upload. Ensure RECORD_SECRET matches.");
		}

		const { videoId, uploadUrl, key } = await initRes.json();
		setCreatedVideoId(videoId);
		setUploadProgress(50);

		// Under 4.0MB: Upload directly through same-origin proxy
		// Over 4.0MB: Upload via presigned PUT to R2
		const VERCEL_BODY_LIMIT = 4.0 * 1024 * 1024;
		let uploadSucceeded = false;

		if (blob.size <= VERCEL_BODY_LIMIT) {
			const proxyRes = await fetch(
				`/api/loom/proxy-upload?videoId=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key || `videos/${videoId}.webm`)}`,
				{
					method: "POST",
					headers: {
						"Content-Type": detectedMime,
						"X-Record-Key": recordKey,
					},
					body: blob,
				},
			);

			if (proxyRes.ok) {
				uploadSucceeded = true;
			} else {
				console.warn("[LoomRecorder] Proxy upload returned non-200, trying direct upload...");
			}
		}

		if (!uploadSucceeded) {
			try {
				const uploadRes = await fetch(uploadUrl, {
					method: "PUT",
					headers: {
						"Content-Type": detectedMime,
					},
					body: blob,
				});

				if (uploadRes.ok) {
					uploadSucceeded = true;
				} else {
					throw new Error(`Direct upload failed with status ${uploadRes.status}`);
				}
			} catch (directErr) {
				// If proxy upload wasn't attempted (because blob > 4.0MB), attempt proxy upload before failing
				if (blob.size > VERCEL_BODY_LIMIT) {
					const proxyFallback = await fetch(
						`/api/loom/proxy-upload?videoId=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key || `videos/${videoId}.webm`)}`,
						{
							method: "POST",
							headers: {
								"Content-Type": detectedMime,
								"X-Record-Key": recordKey,
							},
							body: blob,
						},
					);
					if (proxyFallback.ok) {
						uploadSucceeded = true;
					}
				}

				if (!uploadSucceeded) {
					const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
					throw new Error(
						`Upload of ${sizeMb}MB video was blocked by Cloudflare R2 CORS. Please enable CORS on your R2 bucket in Cloudflare Dashboard, or click Retry below.`,
					);
				}
			}
		}

		setUploadProgress(85);

		// 3. Trigger Async AI Pipeline
		await fetch("/api/loom/process-ai", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Record-Key": recordKey,
			},
			body: JSON.stringify({
				videoId,
				durationSeconds,
				title: videoTitle.trim() || undefined,
				hasAudio,
			}),
		}).catch((e) => {
			console.warn("AI trigger notice:", e);
		});

		setUploadProgress(100);
		setPhase("done");
	};

	const handleFinish = async () => {
		if (timerIntervalRef.current) {
			clearInterval(timerIntervalRef.current);
			timerIntervalRef.current = null;
		}

		const engine = captureEngineRef.current;
		if (!engine) return;

		try {
			const { blob, durationSeconds, mimeType, hasAudio } = await engine.stop();

			if (!blob || blob.size === 0) {
				throw new Error("Recorded video is empty (0 bytes). Please verify camera permissions and record again.");
			}

			lastRecordedRef.current = { blob, durationSeconds, mimeType, hasAudio };
			await uploadVideoBlob(blob, durationSeconds, mimeType, hasAudio);
		} catch (err: unknown) {
			console.error("Upload error:", err);
			setErrorMessage(err instanceof Error ? err.message : "Upload failed.");
			setPhase("error");
		}
	};

	return (
		<div className="w-full max-w-xl mx-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-global-bg p-5 sm:p-7 shadow-xl text-global-text transition-all">
			{/* Top Bar */}
			<div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3 mb-5">
				<div className="flex items-center gap-2.5">
					<div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
					<h2 className="text-base font-bold tracking-tight text-global-text">Video Studio</h2>
				</div>
				<span className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
					Mobile-Ready
				</span>
			</div>

			{/* Verifying Spinner */}
			{isValidating && (
				<div className="py-12 text-center text-xs font-mono text-neutral-500 dark:text-neutral-400 animate-pulse">
					Verifying studio credentials...
				</div>
			)}

			{/* Phase: Auth Form */}
			{!isValidating && phase === "auth" && (
				<form onSubmit={handleKeySubmit} className="space-y-4">
					<p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
						Please enter your <code className="bg-neutral-200 dark:bg-neutral-800 px-1 py-0.5 rounded">RECORD_SECRET</code> key to unlock the capture studio:
					</p>
					<div>
						<input
							type="password"
							placeholder="Enter secret key..."
							value={recordKey}
							onChange={(e) => setRecordKey(e.target.value)}
							className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-3.5 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:border-emerald-500 focus:outline-none font-mono"
						/>
					</div>
					{errorMessage && <p className="text-xs text-rose-500 font-mono">{errorMessage}</p>}
					<button
						type="submit"
						disabled={isValidating}
						className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-xs font-bold text-neutral-950 transition-colors cursor-pointer disabled:opacity-50"
					>
						Unlock Studio
					</button>
				</form>
			)}

			{/* Phase: Active Viewfinder Studio (Preview, Countdown, & Recording share the exact same persistent video element) */}
			{!isValidating && (phase === "preview" || phase === "countdown" || phase === "recording") && (
				<div className="space-y-4">
					{/* Mode Selector (only in preview phase) */}
					{phase === "preview" && (
						<div className="grid grid-cols-3 gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60 text-[11px] font-mono">
							<button
								type="button"
								onClick={() => setCaptureMode("camera")}
								className={`py-2 px-1 rounded-lg font-semibold transition-all cursor-pointer text-center ${
									captureMode === "camera"
										? "bg-emerald-500 text-neutral-950 shadow-sm"
										: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
								}`}
							>
								📱 Camera
							</button>
							<button
								type="button"
								onClick={() => {
									if (hasDisplayMediaSupport) {
										setCaptureMode("screen");
									} else {
										setErrorMessage("Screen recording is not supported on mobile browsers. Please use Camera mode.");
									}
								}}
								className={`py-2 px-1 rounded-lg font-semibold transition-all cursor-pointer text-center ${
									captureMode === "screen"
										? "bg-emerald-500 text-neutral-950 shadow-sm"
										: hasDisplayMediaSupport
											? "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
											: "text-neutral-400 dark:text-neutral-600 opacity-60"
								}`}
								title={hasDisplayMediaSupport ? "Record Screen" : "Screen capture is only supported on Desktop"}
							>
								🖥️ Screen{!hasDisplayMediaSupport && " (PC)"}
							</button>
							<button
								type="button"
								onClick={() => {
									if (hasDisplayMediaSupport) {
										setCaptureMode("screen_with_camera");
									} else {
										setErrorMessage("Screen recording is not supported on mobile browsers. Please use Camera mode.");
									}
								}}
								className={`py-2 px-1 rounded-lg font-semibold transition-all cursor-pointer text-center ${
									captureMode === "screen_with_camera"
										? "bg-emerald-500 text-neutral-950 shadow-sm"
										: hasDisplayMediaSupport
											? "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
											: "text-neutral-400 dark:text-neutral-600 opacity-60"
								}`}
								title={hasDisplayMediaSupport ? "Record Screen with Camera" : "Screen capture is only supported on Desktop"}
							>
								💻 Screen+Cam{!hasDisplayMediaSupport && " (PC)"}
							</button>
						</div>
					)}

					{/* Title Input (only in preview phase) */}
					{phase === "preview" && (
						<div>
							<input
								type="text"
								placeholder="Video title (e.g. Mobile walkthrough / Bug note)..."
								value={videoTitle}
								onChange={(e) => setVideoTitle(e.target.value)}
								className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-3.5 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:border-emerald-500 focus:outline-none font-mono"
							/>
						</div>
					)}

					{/* Persistent Viewfinder: Video element is NEVER unmounted between preview, countdown, and recording */}
					{captureMode === "screen" && phase === "preview" ? (
						<div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-900/50 aspect-video flex flex-col items-center justify-center p-6 text-center space-y-2">
							<span className="text-3xl">🖥️</span>
							<p className="text-xs font-mono text-global-text font-bold">Screen Capture Ready</p>
							<p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 max-w-xs">
								Click Start Recording to select the screen, window, or tab you want to share.
							</p>
						</div>
					) : (
						<div className={`relative rounded-xl overflow-hidden bg-black aspect-video border shadow-inner flex items-center justify-center transition-all ${
							phase === "recording" ? "border-rose-500/60 ring-2 ring-rose-500/20" : "border-neutral-800"
						}`}>
							<video
								ref={(el) => {
									videoRef.current = el;
									if (el && activeStream && el.srcObject !== activeStream) {
										el.srcObject = activeStream;
										el.muted = true;
										el.play().catch(() => {});
									}
								}}
								autoPlay
								muted
								playsInline
								className={`w-full h-full object-cover ${facingMode === "user" && captureMode === "camera" ? "-scale-x-100" : ""}`}
							/>

							{/* Switch Camera Button (Front/Back) - only in preview */}
							{phase === "preview" && captureMode === "camera" && (
								<button
									type="button"
									onClick={toggleFacingMode}
									className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white text-[11px] font-mono flex items-center gap-1.5 hover:bg-black/90 transition-all cursor-pointer z-10"
									title="Flip Front/Rear Camera"
								>
									<span>🔄</span>
									<span>{facingMode === "user" ? "Rear Cam" : "Front Cam"}</span>
								</button>
							)}

							{/* Countdown Overlay directly on top of live stream */}
							{phase === "countdown" && (
								<div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center z-20">
									<p className="text-xs uppercase font-mono tracking-widest text-emerald-400 font-bold mb-1">Get Ready</p>
									<div className="text-7xl font-extrabold text-white font-mono animate-bounce">{countdown}</div>
								</div>
							)}

							{/* Live Recording Badge */}
							{phase === "recording" && (
								<div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-mono z-10">
									<span className={`h-2.5 w-2.5 rounded-full ${isPaused ? "bg-amber-400" : "bg-rose-500 animate-pulse"}`} />
									<span>{formatTime(elapsedSeconds)}</span>
								</div>
							)}
						</div>
					)}

					{/* Below Viewfinder Controls */}
					{phase === "preview" && (
						<>
							{/* Microphone Controls & Status */}
							<div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 p-3 space-y-2.5 text-xs font-mono">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2.5">
										<span className="text-base">{hasMicTrack && enableMic ? "🎙️" : "🔇"}</span>
										<div>
											<p className="font-semibold text-neutral-800 dark:text-neutral-200">Microphone Audio</p>
											<p className="text-[11px] text-neutral-500">
												{hasMicTrack === false
													? "Not connected"
													: enableMic
														? "Active & Connected"
														: "Muted"}
											</p>
										</div>
									</div>

									{hasMicTrack === false ? (
										<button
											type="button"
											onClick={requestMicrophonePermission}
											disabled={isRequestingMic}
											className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-[11px] font-bold font-mono transition-all cursor-pointer disabled:opacity-60 shadow-xs"
										>
											{isRequestingMic ? "Connecting..." : "🎙️ Enable Mic"}
										</button>
									) : (
										<label className="relative inline-flex items-center cursor-pointer">
											<input
												type="checkbox"
												checked={enableMic}
												onChange={handleToggleMic}
												className="sr-only peer"
											/>
											<div className="w-9 h-5 bg-neutral-400 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
										</label>
									)}
								</div>

								{/* Informational notice when mic is not granted or blocked */}
								{micNotice && (
									<div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] leading-relaxed flex items-start gap-2">
										<span className="shrink-0 text-sm">⚠️</span>
										<span>{micNotice}</span>
									</div>
								)}
							</div>

							{/* Confirmation Alert if User tries to record without audio */}
							{showNoAudioConfirm && (
								<div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono space-y-3">
									<div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
										<span className="text-lg">⚠️</span>
										<div>
											<p className="font-bold">No Microphone Audio Detected</p>
											<p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed">
												This video will be recorded without sound (video only). To include voice, allow Microphone in <strong>iPhone Settings &gt; Chrome &gt; Microphone</strong>.
											</p>
										</div>
									</div>
									<div className="flex items-center gap-2 pt-1">
										<button
											type="button"
											onClick={() => startRecordingWorkflow(true)}
											className="flex-1 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs text-center cursor-pointer transition-all"
										>
											📹 Record Silent Video
										</button>
										<button
											type="button"
											onClick={() => setShowNoAudioConfirm(false)}
											className="py-2 px-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-neutral-700 dark:text-neutral-300 font-semibold text-xs cursor-pointer transition-all"
										>
											Cancel
										</button>
									</div>
								</div>
							)}

							{/* Visible Error Notification in Preview Phase */}
							{errorMessage && (
								<div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-mono leading-relaxed flex items-start gap-2">
									<span>⚠️</span>
									<span>{errorMessage}</span>
								</div>
							)}

							{/* Big Touch-Friendly Record Button */}
							<div className="pt-1">
								<button
									type="button"
									disabled={isStarting}
									onClick={() => startRecordingWorkflow(false)}
									className="w-full flex items-center justify-center gap-3 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-900/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
								>
									{isStarting ? (
										<>
											<div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
											<span>Preparing Camera & Mic...</span>
										</>
									) : (
										<>
											<div className="h-4 w-4 rounded-full bg-white animate-ping" />
											<span>Start Recording</span>
										</>
									)}
								</button>
							</div>
						</>
					)}

					{phase === "countdown" && (
						<div className="pt-1">
							<button
								type="button"
								onClick={handleCancel}
								className="w-full py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-mono font-semibold text-rose-500 transition-colors cursor-pointer"
							>
								Cancel
							</button>
						</div>
					)}

					{phase === "recording" && (
						<div className="grid grid-cols-3 gap-2 pt-1">
							<button
								type="button"
								onClick={handlePauseResume}
								className="py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
							>
								{isPaused ? "▶ Resume" : "⏸ Pause"}
							</button>

							<button
								type="button"
								onClick={handleCancel}
								className="py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-mono font-semibold text-rose-500 transition-colors cursor-pointer"
							>
								Discard
							</button>

							<button
								type="button"
								onClick={handleFinish}
								className="py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-mono font-bold text-neutral-950 transition-all cursor-pointer shadow-md"
							>
								✓ Finish
							</button>
						</div>
					)}
				</div>
			)}

			{/* Phase: Uploading */}
			{phase === "uploading" && (
				<div className="py-8 space-y-4 text-center">
					<div className="h-2 w-full bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
						<div
							className="h-full bg-emerald-500 transition-all duration-300"
							style={{ width: `${uploadProgress}%` }}
						/>
					</div>
					<p className="text-xs font-mono text-neutral-900 dark:text-neutral-100 font-semibold">
						Uploading video ({uploadProgress}%)...
					</p>
					<p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
						Non-blocking ingestion & queued AI enrichment.
					</p>
				</div>
			)}

			{/* Phase: Done */}
			{phase === "done" && (
				<div className="space-y-4 text-center py-4">
					<div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500 text-2xl font-bold">
						✓
					</div>
					<div>
						<h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">Recording Uploaded!</h3>
						<p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 font-mono">
							Your video is ready to view. AI chapters & summary are generating.
						</p>
					</div>

					<div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
						<a
							href={`/loom/${createdVideoId}`}
							className="w-full sm:w-auto rounded-lg bg-emerald-500 hover:bg-emerald-400 px-5 py-2.5 text-xs font-mono font-bold text-neutral-950 transition-colors text-center"
						>
							View Video Page →
						</a>
						<button
							type="button"
							onClick={() => {
								setPhase("preview");
								setCreatedVideoId("");
								setVideoTitle("");
							}}
							className="w-full sm:w-auto rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 px-4 py-2.5 text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
						>
							Record New Video
						</button>
					</div>
				</div>
			)}

			{/* Phase: Error with Retry and Save Fallbacks */}
			{phase === "error" && (
				<div className="space-y-4 py-4 text-center">
					<div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/20 text-rose-500 text-lg font-bold">
						!
					</div>
					<p className="text-xs text-rose-500 font-mono leading-relaxed max-w-md mx-auto">{errorMessage}</p>

					<div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
						{lastRecordedRef.current && (
							<button
								type="button"
								onClick={() => {
									if (lastRecordedRef.current) {
										const { blob, durationSeconds, mimeType, hasAudio } = lastRecordedRef.current;
										uploadVideoBlob(blob, durationSeconds, mimeType, hasAudio).catch((err) => {
											setErrorMessage(err instanceof Error ? err.message : "Upload retry failed.");
											setPhase("error");
										});
									}
								}}
								className="w-full sm:w-auto rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-xs font-mono font-bold text-neutral-950 transition-colors cursor-pointer"
							>
								🔄 Retry Upload
							</button>
						)}

						{lastRecordedRef.current && (
							<button
								type="button"
								onClick={() => {
									if (lastRecordedRef.current) {
										const { blob, mimeType } = lastRecordedRef.current;
										const ext = mimeType.includes("mp4") ? "mp4" : "webm";
										const url = URL.createObjectURL(blob);
										const a = document.createElement("a");
										a.href = url;
										a.download = `loom-recording-${Date.now()}.${ext}`;
										document.body.appendChild(a);
										a.click();
										document.body.removeChild(a);
										setTimeout(() => URL.revokeObjectURL(url), 1000);
									}
								}}
								className="w-full sm:w-auto rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 px-4 py-2.5 text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
							>
								💾 Save to Device
							</button>
						)}

						<button
							type="button"
							onClick={() => {
								setErrorMessage("");
								setPhase("preview");
							}}
							className="w-full sm:w-auto rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 px-4 py-2.5 text-xs font-mono text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
						>
							Back to Studio
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
