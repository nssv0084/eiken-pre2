// 生徒に口頭や紙で伝えやすいよう、紛らわしい文字（0/O, 1/l/I）を除いた仮パスワードを作る
export function generateTempPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  return Array.from({ length: 4 }, () => pick(letters)).join("") + Array.from({ length: 4 }, () => pick(digits)).join("");
}
