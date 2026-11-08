import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { ApiError } from './api';

/** Asks once for permission to add files to the gallery. */
export async function galleryPermission(): Promise<boolean> {
  const p = await MediaLibrary.requestPermissionsAsync(true);
  return p.granted;
}

/** Downloads a file into the app cache, reporting progress 0…1. */
export async function downloadToCache(url: string, ext: string, onProgress?: (p: number) => void): Promise<string> {
  const target = `${FileSystem.cacheDirectory}fshow-${Date.now().toString(36)}.${ext}`;
  const task = FileSystem.createDownloadResumable(url, target, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const r = await task.downloadAsync();
  if (!r || r.status < 200 || r.status >= 300) throw new ApiError('network');
  return r.uri;
}

export async function saveToGallery(localUri: string): Promise<void> {
  await MediaLibrary.saveToLibraryAsync(localUri);
}

export function extOf(path: string): string {
  const m = /\.([a-z0-9]{2,4})$/i.exec(path);
  return m ? m[1].toLowerCase() : 'mp4';
}
