import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Extend Window interface for SpeechRecognition
declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

export function SpeechControl() {
    const [connectionState, setConnectionState] = useState<'offline' | 'connecting' | 'online'>('offline');
    const [status, setStatus] = useState<string | null>(null);
    const [liveTranscript, setLiveTranscript] = useState<string | null>(null);

    // Refs for new implementation
    const socketRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isListeningRef = useRef(false); // Keep ref for logic capability

    const navigate = useNavigate();
    const { logout } = useAuth();
    const { urls, handlePlayAll, stopAllPlayback, clearLibrary, handlePlayToggle } = useMusicLibrary();
    const { toast } = useToast();

    // Helper to change listening state in both ref and component state
    const setListeningState = useCallback((state: boolean) => {
        setConnectionState(state ? 'online' : 'offline');
        isListeningRef.current = state;
        if (!state && timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    // Sound feedback for activation
    const playActivationSound = useCallback(() => {
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();

            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(1000, context.currentTime);

            gainNode.gain.setValueAtTime(0, context.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.05, context.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.05);

            oscillator.connect(gainNode);
            gainNode.connect(context.destination);

            oscillator.start();
            oscillator.stop(context.currentTime + 0.05);

            // Clean up AudioContext
            setTimeout(() => {
                context.close();
            }, 100);
        } catch (e) {
            console.error("Failed to play activation sound:", e);
        }
    }, []);

    const processCommand = useCallback((transcript: string) => {
        const text = transcript.toLowerCase().trim();
        console.log("Command Transcript:", text);

        // Navigation Commands
        if (text.includes("go to profile")) {
            setStatus("Navigating to profile...");
            navigate("/profile");
            return true;
        }
        if (text.includes("go home") || text.includes("go to home")) {
            setStatus("Navigating home...");
            navigate("/");
            return true;
        }
        if (text.includes("go back") || text.includes("back to app")) {
            setStatus("Navigating back...");
            navigate(-1);
            return true;
        }
        if (text.includes("go to pricing") || text.includes("view pricing") || text.includes("show pricing")) {
            setStatus("Navigating to pricing...");
            navigate("/pricing");
            return true;
        }
        if (text.includes("view profile") || text.includes("show profile")) {
            setStatus("Navigating to profile...");
            navigate("/profile");
            return true;
        }

        // Playback Commands
        if (text.includes("play all") || text.includes("play music")) {
            if (urls.length > 0) {
                setStatus(`Playing all tracks for: ${urls[0].title}`);
                handlePlayAll(urls[0]);
            } else {
                setStatus("No tracks found in library.");
            }
            return true;
        }
        if (text.includes("stop music") || text.includes("stop all")) {
            setStatus("Stopping playback...");
            stopAllPlayback();
            return true;
        }
        if (text.includes("clear library")) {
            setStatus("Clearing library...");
            clearLibrary();
            return true;
        }

        // System Commands
        if (text.includes("refresh page") || text.includes("refresh")) {
            setStatus("Refreshing page...");
            window.location.reload();
            return true;
        }
        if (text.includes("logout") || text.includes("sign out")) {
            setStatus("Logging out...");
            logout();
            return true;
        }

        if (text.endsWith("done") || text === "stop listening" || text === "turn off") {
            setStatus("Powering off voice control...");
            stopListening();
            return true;
        }

        // File Actions
        if (text.includes("upload file") || text.includes("upload music")) {
            setStatus("Opening file picker...");
            document.getElementById('audioUpload')?.click();
            return true;
        }
        if (text.includes("split song") || text.includes("split music") || text.includes("split")) {
            setStatus("Starting analysis...");
            window.dispatchEvent(new CustomEvent('voice-trigger-split'));
            return true;
        }

        // TOS and Stem Interactions
        if (text.includes("view tos") || text.includes("view terms") || text.includes("show terms")) {
            setStatus("Opening Terms of Service...");
            window.dispatchEvent(new CustomEvent('voice-view-tos'));
            return true;
        }

        if (text.includes("select all stems") || text.includes("select all")) {
            setStatus("Selecting all stems...");
            window.dispatchEvent(new CustomEvent('voice-select-stem', { detail: { stemId: 'all' } }));
            return true;
        }

        if (text.includes("deselect all stems") || text.includes("deselect all") || text.includes("clear stems")) {
            setStatus("Deselecting all stems...");
            window.dispatchEvent(new CustomEvent('voice-select-stem', { detail: { stemId: 'none' } }));
            return true;
        }

        const selectStemMatch = text.match(/select (.+)/i);
        if (selectStemMatch) {
            let stemId = selectStemMatch[1].trim();
            // Handle aliases/variations
            if (stemId.includes("drum") || stemId.includes("percussion")) stemId = "percussion";
            if (stemId.includes("vocal")) stemId = "vocals";
            if (stemId.includes("instrumental") || stemId.includes("instrument")) stemId = "instrumental";
            if (stemId.includes("original") || stemId.includes("source")) stemId = "original audio";

            const validStems = ["vocals", "percussion", "bass", "other", "instrumental", "original audio"];
            if (validStems.includes(stemId)) {
                setStatus(`Toggling ${stemId}...`);
                window.dispatchEvent(new CustomEvent('voice-select-stem', { detail: { stemId } }));
            }
            return true;
        }

        // Specific Stem Playback: "Play [stem] for/from [song]"
        // e.g., "play vocals from bohemian rhapsody"
        const stemMatch = text.match(/play (.+) (?:for|from) (.+)/i);
        if (stemMatch) {
            const stemName = stemMatch[1].trim();
            const songTitle = stemMatch[2].trim();

            const song = urls.find(u => u.title.toLowerCase().includes(songTitle));
            if (song) {
                const layer = song.layers.find(l =>
                    l.name.toLowerCase().includes(stemName) ||
                    l.id.toLowerCase().includes(stemName) ||
                    (stemName === "original audio" && l.id === "original") ||
                    (stemName === "percussion" && l.id === "drums")
                );

                if (layer) {
                    const f = song.files?.find(file => {
                        const parts = file.filename.replace(/\\/g, '/').split('/');
                        const basename = parts[parts.length - 1].split('.')[0].toLowerCase();
                        return basename === layer.id.toLowerCase();
                    });

                    if (f) {
                        const trackKey = `${song.id}__${f.filename}`;
                        setStatus(`Playing ${layer.name} for ${song.title}`);
                        handlePlayToggle(trackKey, f, song);
                        return true;
                    }
                } else {
                    setStatus(`Could not find stem "${stemName}" for "${song.title}"`);
                }
            } else {
                setStatus(`Could not find song "${songTitle}" in library`);
            }
            return true; // Match found (even if song/stem not found)
        }

        return false; // No command matched
    }, [urls, navigate, logout, handlePlayAll, stopAllPlayback, clearLibrary, handlePlayToggle]);

    const stopListening = useCallback(() => {
        setListeningState(false);
        setStatus(null);

        // Stop recorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            // Stop all tracks to release microphone
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
        mediaRecorderRef.current = null;

        // Close socket
        if (socketRef.current) {
            socketRef.current.close();
        }
        socketRef.current = null;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, [setListeningState]);

    const resetInactivityTimeout = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (isListeningRef.current) {
                console.log("Auto-stopping due to inactivity");
                stopListening();
            }
        }, 10000); // 10 seconds
    }, [stopListening]);

    const startListening = useCallback(async () => {
        try {
            setConnectionState('connecting');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Determine WebSocket URL
            const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
            const wsUrl = apiBase.replace(/^http/, 'ws') + '/ws/transcribe';

            // Connect
            const socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                console.log("WebSocket connected");
                playActivationSound();
                setStatus("Online");
                setListeningState(true);
                setLiveTranscript(null);
                resetInactivityTimeout();

                // Start MediaRecorder
                // Use a supported mimeType or let browser decide (but we told backend WEBM_OPUS)
                // Chrome usually supports 'audio/webm;codecs=opus'
                let options = { mimeType: 'audio/webm;codecs=opus' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    console.warn("audio/webm;codecs=opus not supported, falling back to default");
                    options = undefined;
                }

                const recorder = new MediaRecorder(stream, options);
                mediaRecorderRef.current = recorder;

                let chunkCount = 0;
                recorder.ondataavailable = (e) => {
                    chunkCount++;
                    if (chunkCount <= 3) {
                        console.log(`[Audio] Chunk #${chunkCount}, size: ${e.data.size} bytes, type: ${e.data.type}`);
                    }
                    if (e.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                        socket.send(e.data);
                        if (chunkCount <= 3) {
                            console.log(`[Audio] Sent chunk #${chunkCount} to backend`);
                        }
                    } else if (e.data.size === 0) {
                        console.warn(`[Audio] Chunk #${chunkCount} is empty (0 bytes)`);
                    }
                };

                recorder.start(250); // Send 250ms chunks
                console.log(`[Audio] MediaRecorder started with mimeType: ${recorder.mimeType}`);
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    const { transcript, isFinal } = data;

                    if (transcript) {
                        resetInactivityTimeout();
                        setLiveTranscript(transcript);

                        if (isFinal) {
                            // Run command and auto-pause
                            const matched = processCommand(transcript);
                            if (matched) {
                                toast({
                                    title: "Voice Command",
                                    description: transcript,
                                });
                            }

                            // Auto-pause
                            stopListening();

                            // Persist transcript briefly
                            setTimeout(() => setLiveTranscript(null), 3500);
                        }
                    }
                } catch (e) {
                    console.error("Error parsing WebSocket message:", e);
                }
            };

            socket.onerror = (error) => {
                console.error("WebSocket error:", error);
                // Don't toast immediately if it's just a connection drop, but maybe if initial connect fails
                if (connectionState === 'connecting') {
                    toast({ title: "Connection Error", description: "Failed to connect to speech server.", variant: "destructive" });
                }
                stopListening();
            };

            socket.onclose = () => {
                console.log("WebSocket closed");
                if (isListeningRef.current) {
                    stopListening();
                }
            };

        } catch (err) {
            console.error("Error starting voice control:", err);
            toast({
                title: "Microphone Access Denied",
                description: "Please enable microphone access in your browser settings.",
                variant: "destructive"
            });
            stopListening();
        }
    }, [playActivationSound, processCommand, resetInactivityTimeout, setListeningState, stopListening, toast, connectionState]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            stopListening();
        };
    }, [stopListening]);

    const toggleListening = () => {
        if (connectionState === 'online' || connectionState === 'connecting') {
            stopListening();
        } else {
            startListening();
        }
    };

    return (
        <div className="flex items-center gap-3 bg-background/40 backdrop-blur-md px-4 py-2 rounded-full border border-primary/20 shadow-glow-sm transition-all hover:bg-background/60 group">
            <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary leading-none">Voice Control</span>
                <span className="text-[9px] text-muted-foreground leading-none mt-1 uppercase">
                    {connectionState === 'connecting' ? 'Connecting...' : (connectionState === 'online' ? 'Online' : 'Offline')}
                </span>
            </div>
            <div className="relative">
                <Button
                    variant={connectionState === 'online' ? "default" : "outline"}
                    size="icon"
                    onClick={toggleListening}
                    disabled={connectionState === 'connecting'}
                    className={cn(
                        "relative transition-all rounded-full w-12 h-12 shadow-lg border-2",
                        connectionState === 'online'
                            ? "bg-primary hover:bg-primary/90 border-primary animate-pulse shadow-primary/20"
                            : "bg-background/20 hover:bg-background/40 border-primary/30",
                        connectionState === 'connecting' && "opacity-80"
                    )}
                    title={connectionState === 'online' ? "Stop Listening" : "Start Voice Control"}
                >
                    {connectionState === 'connecting' ? (
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    ) : connectionState === 'online' ? (
                        <Mic className="w-6 h-6 text-white" />
                    ) : (
                        <MicOff className="w-6 h-6 text-muted-foreground" />
                    )}
                </Button>
                {connectionState === 'online' && (
                    <span className="absolute -inset-1 rounded-full border-2 border-primary/50 animate-ping opacity-20 pointer-events-none" />
                )}
            </div>

            {/* Transcription Dialog Overlay */}
            {(connectionState === 'online' || connectionState === 'connecting' || liveTranscript) && (
                <div className={cn(
                    "fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 transform",
                    (connectionState !== 'offline' || liveTranscript) ? "translate-y-0 opacity-100 scale-100" : "translate-y-4 opacity-0 scale-95 pointer-events-none"
                )}>
                    <div className="bg-card/80 backdrop-blur-2xl border border-primary/30 shadow-2xl rounded-2xl px-8 py-6 flex flex-col items-center gap-4 min-w-[320px] max-w-[90vw]">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-2.5 h-2.5 rounded-full",
                                connectionState === 'online' ? "bg-primary animate-pulse shadow-glow" :
                                    connectionState === 'connecting' ? "bg-yellow-400 animate-pulse" : "bg-muted"
                            )} />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary leading-none">
                                {connectionState === 'connecting' ? "Connecting..." : (connectionState === 'online' ? "Listening Live" : "Processing")}
                            </span>
                        </div>

                        <div className="text-lg md:text-xl font-medium text-foreground text-center line-clamp-2 min-h-[1.5em] transition-all">
                            {liveTranscript ? (
                                <span className="text-foreground italic">"{liveTranscript}"</span>
                            ) : (
                                <span className={cn(
                                    "text-muted-foreground/40 italic",
                                    connectionState === 'online' && "text-primary/60 font-semibold not-italic"
                                )}>
                                    {connectionState === 'connecting' ? "Connecting to server..." :
                                        connectionState === 'online' ? "Online" : "Terminated"}
                                </span>
                            )}
                        </div>

                        {status && (
                            <div className="text-[11px] font-bold text-primary bg-primary/10 px-3 py-1 rounded-full animate-fade-in">
                                {status}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
