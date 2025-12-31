import { useMusicLibraryContext } from "@/contexts/MusicLibraryContext";

export type { MusicLayer, MusicUrl } from "@/contexts/MusicLibraryContext";

export function useMusicLibrary() {
  return useMusicLibraryContext();
}
