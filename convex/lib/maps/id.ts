const MAP_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
export const MAP_ID_LENGTH = 24;

export function generateMapId(): string {
  const bytes = new Uint8Array(MAP_ID_LENGTH);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < MAP_ID_LENGTH; i++) {
    id += MAP_ID_CHARS[bytes[i]! % MAP_ID_CHARS.length];
  }
  return id;
}
