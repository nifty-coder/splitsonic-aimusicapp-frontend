import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Music, Volume2, Piano, Drum, Zap, Mic, Music2, Trash2, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const iconMap = {
  Volume2,
  Drum,
  Mic,
  Piano,
  Music,
  Zap,
  Music2
};

interface MusicSidebarProps {
  onUrlSelect?: (url: string) => void;
}

export function MusicSidebar({ onUrlSelect }: MusicSidebarProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloadControllers, setDownloadControllers] = useState<Record<string, AbortController | null>>({});
  const [availableFiles, setAvailableFiles] = useState<Record<string, Set<string>>>({});
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { urls, removeMusicUrl, clearLibrary, updateMusicTitle, scheduleRemoveMusicUrl, undoRemoveMusicUrl, scheduleClearLibrary, undoClearLibrary } = useMusicLibrary();
  const { toast } = useToast();

  // Auto-refresh caches when library changes
  useEffect(() => {
    setAvailableFiles({});
    setTitleOverrides({});
    setDownloading({});
  }, [urls]);

  // In production, set VITE_API_BASE_URL to your deployed backend URL
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  // Helper: find a specific file entry in a JSZip archive and return a Blob
  const findEntryInZip = async (zipBlob: Blob, filename: string): Promise<Blob | null> => {
    // @ts-ignore
    const JSZipModule = await import('jszip');
    // @ts-ignore
    const JSZip = (JSZipModule as any).default || JSZipModule;
    const zip = await JSZip.loadAsync(zipBlob);
    let entry = zip.files[filename] || null;
    if (!entry) {
      const keys = Object.keys(zip.files);
      const found = keys.find(k => k.endsWith(filename));
      if (found) entry = zip.files[found];
    }
    if (!entry) return null;
    const fileData = await entry.async('blob');
    return fileData;
  };

  // Helper: Play or stop a file preview
  const handlePlayToggle = async (e: any, key: string, f: any, musicUrl: any) => {
    e.stopPropagation();
    try {
      if (playingKey === key) {
        audioRef.current?.pause();
        audioRef.current = null;
        setPlayingKey(null);
        if (playingUrl) {
          URL.revokeObjectURL(playingUrl);
          setPlayingUrl(null);
        }
        return;
      }

      // stop previous
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (playingUrl) {
        URL.revokeObjectURL(playingUrl);
        setPlayingUrl(null);
      }

      let srcUrl: string | null = null;
      if (f.blobUrl) {
        srcUrl = f.blobUrl;
      } else if (musicUrl.cacheKey) {
        // use individual stem endpoint for efficiency/streaming
        srcUrl = `${apiBase}/stems/${musicUrl.cacheKey}/${f.filename}`;
      }



      if (!srcUrl) throw new Error('No playable source');
      const audio = new Audio(srcUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingKey(null);
        audioRef.current = null;
        if (playingUrl) {
          URL.revokeObjectURL(playingUrl);
          setPlayingUrl(null);
        }
      };
      await audio.play();
      setPlayingKey(key);
    } catch (err: any) {
      toast({ title: 'Playback failed', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  // Helper: download a file (from blobUrl or by extracting from remote ZIP)
  const handleDownload = async (e: any, key: string, f: any, musicUrl: any) => {
    e.stopPropagation();
    if (downloading[key]) return;
    const controller = new AbortController();
    setDownloadControllers(prev => ({ ...prev, [key]: controller }));
    setDownloading(prev => ({ ...prev, [key]: true }));
    try {
      if (f.blobUrl) {
        const a = document.createElement('a');
        a.href = f.blobUrl;
        a.download = f.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else if (musicUrl.cacheKey) {
        // use individual stem endpoint
        const url = `${apiBase}/stems/${musicUrl.cacheKey}/${f.filename}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = f.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        throw new Error('Original uploaded file not available for re-download in this session.');
      }
    } catch (err: any) {
      if (err && err.name === 'AbortError') {
        toast({ title: 'Download cancelled', description: 'The download was stopped.', variant: 'default' });
      } else {
        toast({ title: 'Download failed', description: err?.message || String(err), variant: 'destructive' });
      }
    } finally {
      setDownloading(prev => ({ ...prev, [key]: false }));
      setDownloadControllers(prev => ({ ...prev, [key]: null }));
    }
  };

  // When expanding a YouTube item, fetch the extracted file listing from backend
  // const ensureAvailableFiles = async (musicUrlId: string, musicUrl: any) => {
  //   if (!musicUrl.url || !musicUrl.url.startsWith('http')) return;
  //   if (availableFiles[musicUrlId]) return; // already fetched
  //   try {
  //     const res = await fetch(`${apiBase}/youtube/extracted`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ youtube_url: musicUrl.url })
  //     });
  //     if (!res.ok) {
  //       // ignore failure; we won't filter files in that case
  //       return;
  //     }
  //     const json = await res.json();
  //     // If backend provided a title header on prior /youtube request we may get it later
  //     const titleHeader = res.headers.get('X-Video-Title');
  //     if (titleHeader) {
  //       setTitleOverrides(prev => ({ ...prev, [musicUrlId]: titleHeader }));
  //       // Also update the stored MusicUrl title so it persists
  //       try {
  //         updateMusicTitle(musicUrlId, titleHeader);
  //       } catch (e) {
  //         // ignore
  //       }
  //     }
  //     const names = new Set<string>();
  //     if (Array.isArray(json.extracted_files)) {
  //       for (const f of json.extracted_files) {
  //         if (f && f.filename) {
  //           // skip directory-like entries
  //           if (f.filename.startsWith('audio/') || f.filename.endsWith('/')) continue;
  //           names.add(f.filename);
  //         }
  //       }
  //     }
  //     setAvailableFiles(prev => ({ ...prev, [musicUrlId]: names }));
  //   } catch (err) {
  //     // ignore and don't block UI
  //     console.warn('Failed to fetch extracted listing', err);
  //   }
  // };

  return (
    <div className="w-80 md:w-80 h-full md:h-screen bg-card border-r border-border/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-border/50 bg-gradient-secondary flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Music Library</h2>
          <p className="hidden md:block text-sm text-muted-foreground">{urls.length} tracks analyzed</p>
        </div>
        <div>
          {urls.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                // schedule clear with undo
                try {
                  scheduleClearLibrary();
                  toast({
                    title: 'Library cleared',
                    description: 'All items removed. Undo?',
                    action: (
                      <button
                        className="text-sm underline"
                        onClick={() => undoClearLibrary()}
                      >
                        Undo
                      </button>
                    )
                  });
                } catch (err: any) {
                  toast({ title: 'Error', description: err?.message || 'Failed to clear library', variant: 'destructive' });
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* URL List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {urls.length === 0 ? null : (
            urls.map((musicUrl, idx) => {
              const isExpanded = expandedItems.has(musicUrl.id);

              return (
                <div
                  key={musicUrl.id}
                  className={cn(
                    // softened visuals
                    "bg-muted/10 rounded-xl border border-border/10 overflow-hidden transition-all duration-300",
                    "animate-fade-in"
                  )}
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  {/* URL Header */}
                  <button
                    onClick={() => {
                      toggleExpanded(musicUrl.id);
                    }}
                    className="w-full p-3 text-left flex items-center gap-3 hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex-shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-primary" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground text-sm">
                          {titleOverrides[musicUrl.id] || musicUrl.title}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {musicUrl.addedAt.toLocaleDateString()}
                      </p>
                    </div>

                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        try {
                          scheduleRemoveMusicUrl(musicUrl.id);
                          toast({
                            title: 'Item deleted',
                            description: 'The item has been removed. Undo?',
                            action: (
                              <button
                                className="text-sm underline"
                                onClick={() => {
                                  undoRemoveMusicUrl(musicUrl.id);
                                }}
                              >
                                Undo
                              </button>
                            )
                          });
                        } catch (err: any) {
                          toast({ title: 'Error', description: err?.message || 'Failed to delete item', variant: 'destructive' });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const ev = e as React.KeyboardEvent<HTMLSpanElement>;
                          ev.currentTarget.click?.();
                        }
                      }}
                      className="p-1 hover:bg-destructive/20 rounded transition-colors inline-flex items-center"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </span>
                  </button>

                  {/* Layers Dropdown */}
                  {isExpanded && (
                    <div className="border-t border-border/20 bg-card/0 animate-slide-up">
                      <div className="p-2 space-y-2">
                        {/* Unified Audio Tracks / Layers List */}
                        <div className="space-y-1 mt-1">
                          {musicUrl.layers.map((layer) => {
                            const IconComponent = iconMap[layer.icon as keyof typeof iconMap] || Music;

                            // Find the corresponding file in musicUrl.files
                            const f = musicUrl.files?.find(file => {
                              const parts = file.filename.replace(/\\/g, '/').split('/');
                              const basename = parts[parts.length - 1].split('.')[0].toLowerCase();
                              return basename === layer.id.toLowerCase();
                            });

                            if (!f) return null;
                            const trackKey = `${musicUrl.id}__${f.filename}`;
                            const isPlaying = playingKey === trackKey;

                            return (
                              <div
                                key={layer.id}
                                className={cn(
                                  "group flex items-center gap-3 p-2 rounded-lg transition-all duration-200",
                                  "bg-background/40 hover:bg-background/60 border border-border/5 mb-1",
                                  isPlaying && "ring-1 ring-primary/30 bg-background/80"
                                )}
                              >
                                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-muted/20 group-hover:bg-primary/10 transition-colors">
                                  <IconComponent className={cn("w-4 h-4 transition-colors", isPlaying ? "text-primary" : "text-muted-foreground")} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-foreground truncate">
                                      {layer.name}
                                    </span>

                                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={(e) => handlePlayToggle(e, trackKey, f, musicUrl)}
                                        className={cn(
                                          "p-1.5 rounded-md transition-all hover:scale-110",
                                          isPlaying ? "bg-primary/20 text-primary" : "hover:bg-primary/10 text-muted-foreground hover:text-primary"
                                        )}
                                        title={isPlaying ? "Stop Preview" : "Play Preview"}
                                      >
                                        {isPlaying ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Volume2 className="w-3.5 h-3.5" />
                                        )}
                                      </button>

                                      <button
                                        onClick={(e) => handleDownload(e, trackKey, f, musicUrl)}
                                        disabled={!!downloading[trackKey]}
                                        className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all hover:scale-110 disabled:opacity-50"
                                        title="Download Track"
                                      >
                                        {downloading[trackKey] ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Download className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {musicUrl.processed && (
                          <div className="pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs gap-2 py-4 bg-primary/5 border-primary/10 hover:bg-primary/10 hover:border-primary/20 text-primary transition-all rounded-xl"
                              onClick={(e) => {
                                e.stopPropagation();
                                const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                                window.open(`${base}/cache/${musicUrl.cacheKey}`, '_blank');
                              }}
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download Complete ZIP Archive
                            </Button>
                          </div>
                        )}

                        {musicUrl.layers.length === 0 && (
                          <div className="text-xs text-muted-foreground p-4 bg-muted/5 rounded-xl italic text-center border border-dashed border-border/20">
                            No audio tracks found for this analysis.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}