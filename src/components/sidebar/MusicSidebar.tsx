import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Music, Volume2, Piano, Drum, Zap, Mic, Music2, Trash2, Loader2, Download, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { useAuth } from "@/contexts/AuthContext";
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
  const {
    urls,
    removeMusicUrl,
    clearLibrary,
    updateMusicTitle,
    getPresignedUrl,
    playingKeys,
    pausedKeys,
    currentTimes,
    durations,
    handlePlayToggle: contextPlayToggle,
    handleSeek: contextSeek,
    stopAllPlayback,
    handlePlayAll
  } = useMusicLibrary();
  const { currentUser } = useAuth();
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

  // Wrap handlePlayToggle to stop propagation
  const handlePlayToggle = async (e: any, key: string, f: any, musicUrl: any) => {
    e.stopPropagation();
    try {
      await contextPlayToggle(key, f, musicUrl);
    } catch (err: any) {
      toast({ title: 'Playback failed', description: err?.message || String(err), variant: 'destructive' });
    }
  };

  // Use contextSeek
  const handleSeek = (key: string, time: number) => {
    contextSeek(key, time);
  };

  // Helper: Format time as MM:SS
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Use stopAllPlayback from context
  const handleStopAll = () => {
    stopAllPlayback();
  };

  // Helper: download a file (from blobUrl or by fetching from remote)
  const handleDownload = async (e: any, key: string, f: any, musicUrl: any) => {
    e.stopPropagation();
    if (downloading[key]) return;
    const controller = new AbortController();
    setDownloadControllers(prev => ({ ...prev, [key]: controller }));
    setDownloading(prev => ({ ...prev, [key]: true }));
    try {
      let downloadUrl: string | null = null;
      let headers: HeadersInit = {};

      // Check if this is an R2-stored file (has song_id)
      if (musicUrl.song_id && !f.blobUrl) {
        downloadUrl = await getPresignedUrl(musicUrl.song_id, f.filename);
      } else if (f.blobUrl) {
        downloadUrl = f.blobUrl;
      } else if (musicUrl.cacheKey) {
        // use individual stem endpoint
        downloadUrl = `${apiBase}/stems/${musicUrl.cacheKey}/${f.filename}`;
      }

      if (!downloadUrl) {
        throw new Error('Original uploaded file not available for re-download in this session.');
      }

      // For local blob URLs, we use fetch to ensure the filename is set correctly in the Blob.
      // For remote R2 or cache URLs, we avoid fetch to bypass CORS and rely on backend headers.
      if (f.blobUrl) {
        const response = await fetch(downloadUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = f.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
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
              onClick={async () => {
                try {
                  await clearLibrary();
                  toast({
                    title: 'Library cleared',
                    description: 'All items have been removed.',
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
          {urls.map((musicUrl, idx) => {
            const isExpanded = expandedItems.has(musicUrl.id);

            return (
              <div
                key={musicUrl.id}
                className={cn(
                  "bg-muted/10 rounded-xl border border-border/10 overflow-hidden transition-all duration-300",
                  "animate-fade-in"
                )}
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                {/* URL Header */}
                <button
                  onClick={() => toggleExpanded(musicUrl.id)}
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
                    <div className="flex items-center justify-between gap-2">
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
                      const stemFiles = musicUrl.files?.filter((f: any) => f.filename !== 'original.mp3') || [];
                      const allKeys = stemFiles.map((f: any) => `${musicUrl.id}__${f.filename}`);
                      const isAnyPlaying = allKeys.some((k: string) => playingKeys.has(k));

                      if (isAnyPlaying) {
                        stopAllPlayback();
                      } else {
                        handlePlayAll(musicUrl);
                      }
                    }}
                    className="flex-shrink-0 p-1 hover:bg-primary/20 rounded transition-colors"
                  >
                    {musicUrl.files?.filter((f: any) => f.filename !== 'original.mp3').some((f: any) => playingKeys.has(`${musicUrl.id}__${f.filename}`)) ? (
                      <Pause className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </span>

                  <span
                    role="button"
                    tabIndex={0}
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await removeMusicUrl(musicUrl.id);
                        toast({
                          title: 'Item deleted',
                          description: 'The item has been removed.',
                        });
                      } catch (err: any) {
                        toast({ title: 'Error', description: err?.message || 'Failed to delete item', variant: 'destructive' });
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
                      <div className="space-y-1 mt-1">
                        {musicUrl.layers.map((layer) => {
                          const IconComponent = iconMap[layer.icon as keyof typeof iconMap] || Music;
                          const f = musicUrl.files?.find(file => {
                            const parts = file.filename.replace(/\\/g, '/').split('/');
                            const basename = parts[parts.length - 1].split('.')[0].toLowerCase();
                            return basename === layer.id.toLowerCase();
                          });

                          if (!f) return null;
                          const trackKey = `${musicUrl.id}__${f.filename}`;
                          const isPlaying = playingKeys.has(trackKey);
                          const isOriginal = f.filename === 'original.mp3';
                          const displayName = isOriginal ? 'Original Audio' : layer.name;
                          const DisplayIcon = isOriginal ? Music2 : IconComponent;

                          return (
                            <div
                              key={layer.id}
                              className={cn(
                                "group flex flex-col p-2 rounded-lg transition-all duration-200",
                                "bg-background/40 hover:bg-background/60 border border-border/5 mb-1",
                                isPlaying && "ring-1 ring-primary/30 bg-background/80"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-muted/20 group-hover:bg-primary/10 transition-colors">
                                  <DisplayIcon className={cn("w-4 h-4 transition-colors", isPlaying ? "text-primary" : "text-muted-foreground")} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={(e) => handlePlayToggle(e, trackKey, f, musicUrl)}
                                        className={cn(
                                          "p-1.5 rounded-md transition-all",
                                          isPlaying ? "bg-primary/20 text-primary" : "hover:bg-primary/10 text-muted-foreground",
                                          pausedKeys.has(trackKey) && "bg-yellow-500/10 text-yellow-500"
                                        )}
                                      >
                                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                      </button>
                                      <button
                                        onClick={(e) => handleDownload(e, trackKey, f, musicUrl)}
                                        disabled={!!downloading[trackKey]}
                                        className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground"
                                      >
                                        {downloading[trackKey] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {(isPlaying || pausedKeys.has(trackKey)) && (
                                <div className="mt-2 flex items-center gap-2 px-1">
                                  <span className="text-xs text-muted-foreground w-10 text-left">
                                    {formatTime(currentTimes[trackKey] || 0)}
                                  </span>
                                  <input
                                    type="range"
                                    min="0"
                                    max={durations[trackKey] || 100}
                                    value={currentTimes[trackKey] || 0}
                                    onChange={(e) => handleSeek(trackKey, Number(e.target.value))}
                                    className="flex-1 h-1 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                                  />
                                  <span className="text-xs text-muted-foreground w-10 text-right">
                                    {formatTime(durations[trackKey] || 0)}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {musicUrl.processed && (
                        <div className="pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs gap-2 py-4 bg-primary/10 border-primary hover:bg-primary text-white transition-all rounded-xl"
                            disabled={downloading[`${musicUrl.id}_zip`]}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const zipKey = `${musicUrl.id}_zip`;
                              if (downloading[zipKey]) return;

                              setDownloading(prev => ({ ...prev, [zipKey]: true }));
                              try {
                                const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                                let downloadUrl: string;

                                if (musicUrl.song_id && !musicUrl.cacheKey) {
                                  const token = await currentUser?.getIdToken();
                                  if (!token) throw new Error("Not authenticated");
                                  downloadUrl = `${base}/songs/${musicUrl.song_id}/zip?token=${token}`;

                                  const response = await fetch(`${base}/songs/${musicUrl.song_id}/zip`, {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                  });
                                  if (!response.ok) throw new Error(`Failed to download ZIP: ${response.statusText}`);
                                  const blob = await response.blob();
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `${musicUrl.title || 'archive'}.zip`;
                                  document.body.appendChild(a);
                                  a.click();
                                  a.remove();
                                  window.URL.revokeObjectURL(url);
                                } else {
                                  downloadUrl = `${base}/cache/${musicUrl.cacheKey}`;
                                  // Direct link to avoid CORS for the public cache endpoint. 
                                  // Backend serves with Content-Disposition: attachment.
                                  const a = document.createElement('a');
                                  a.href = downloadUrl;
                                  a.download = `${musicUrl.title || 'archive'}.zip`;
                                  document.body.appendChild(a);
                                  a.click();
                                  a.remove();
                                }
                              } catch (err: any) {
                                toast({
                                  title: 'Download failed',
                                  description: err?.message || String(err),
                                  variant: 'destructive'
                                });
                              } finally {
                                setDownloading(prev => ({ ...prev, [zipKey]: false }));
                              }
                            }}
                          >
                            {downloading[`${musicUrl.id}_zip`] ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
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
                )
                }
              </div>
            );
          })}
        </div>
      </div>
    </div >
  );
}