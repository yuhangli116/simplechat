// Utility to generate random pet names and avatars
const PET_NAMES = [
  "SpaceCat", "PixelDog", "CyberFox", "NeonRabbit", "StarPanda",
  "CloudBear", "LunarWolf", "SolarLion", "QuantumOwl", "CodeMonkey",
  "ByteHamster", "LogicLlama", "DataDino", "AlgoAlpaca", "BitBeaver"
];

const AVATAR_STYLES = [
  "micah", "avataaars", "bottts", "initials", "identicon"
];

// Using DiceBear API for avatars
export const getRandomAvatar = (seed: string) => {
  // Use 'micah' style for cute, clean avatars, or 'avataaars' for classic.
  // 'notionists' is also very elegant but might need a paid tier on some services.
  // Let's stick to 'micah' as it looks modern and artistic.
  return `https://api.dicebear.com/9.x/micah/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
};

export const getRandomName = () => {
  const prefix = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)];
  const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}_${suffix}`;
};

// Helper to get or create a persistent random profile for a user (if not logged in or missing metadata)
export const getUserProfile = (user: any) => {
  if (!user) return null;
  
  // Check if we have metadata
  const meta = user.user_metadata || {};
  
  // If we have a name/avatar in metadata, use it
  if (meta.name && meta.avatar_url) {
    return {
      name: meta.name,
      avatar: meta.avatar_url,
      isVip: meta.is_vip || false
    };
  }

  // Otherwise, generate one based on the user ID (consistent for same user)
  // In a real app, we should save this back to the profile, but for now we just compute it.
  const seed = user.id || 'guest';
  // Use a simple hash of the ID to pick a name index
  const hash = seed.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
  const nameIndex = hash % PET_NAMES.length;
  const suffix = (hash % 1000).toString().padStart(3, '0');
  
  return {
    name: meta.name || `${PET_NAMES[nameIndex]}_${suffix}`,
    avatar: meta.avatar_url || getRandomAvatar(seed),
    isVip: meta.is_vip || false
  };
};
