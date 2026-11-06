import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { db, storage } from './firebase';

/** React Native's fetch().blob() is unreliable for local files; XHR works everywhere. */
function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new TypeError('Could not read image'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

/** Uploads the profile picture to avatars/{uid}/avatar.jpg and saves the URL on the profile. */
export async function uploadAvatar(uid: string, localUri: string): Promise<string> {
  const blob = await uriToBlob(localUri);
  if (blob.size > 5 * 1024 * 1024) throw new Error('too-big');
  const r = ref(storage, `avatars/${uid}/avatar.jpg`);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  // Close the blob to free memory (RN-specific).
  (blob as any).close?.();
  const url = await getDownloadURL(r);
  await updateDoc(doc(db, 'users', uid), { photoURL: url });
  return url;
}
