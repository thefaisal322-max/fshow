export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  gender: 'male' | 'female';
  birthday: Date | string;
  username: string | null;
  bio: string;
  photo_path: string | null;
  is_fainet: boolean;
  profile_complete: boolean;
  followers_count: number;
  following_count: number;
  likes_count: number;
  posts_count: number;
  status: 'active' | 'banned';
  created_at: Date;
};

/** What other people may see. */
export function publicUser(u: UserRow, publicUrl: string) {
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    displayName: `${u.first_name} ${u.last_name}`,
    gender: u.gender,
    username: u.username,
    bio: u.bio,
    photoURL: u.photo_path ? `${publicUrl}/media/${u.photo_path}` : null,
    isFainet: u.is_fainet,
    followersCount: u.followers_count,
    followingCount: u.following_count,
    likesCount: u.likes_count,
    postsCount: u.posts_count,
  };
}

function isoDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  // pg returns DATE as a local-midnight Date; format it back without timezone shifts.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** What the account owner sees about themselves. Never includes password_hash. */
export function meUser(u: UserRow, publicUrl: string) {
  return {
    ...publicUser(u, publicUrl),
    email: u.email,
    birthday: isoDate(u.birthday),
    profileComplete: u.profile_complete,
  };
}
