// AES-GCM 加密（原订阅 URL、输出密钥、兜底缓存）+ SHA-256 工具。
// 密钥由 ENCRYPTION_KEY 经 SHA-256 派生；密文格式 "v1.<iv b64url>.<ciphertext b64url>"。
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function aesKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle
      .digest("SHA-256", enc.encode("sub-morph:v1:" + secret))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
    keyCache.set(secret, k);
  }
  return k;
}

export async function encrypt(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), enc.encode(plain));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function decrypt(token: string, secret: string): Promise<string> {
  const [v, iv, ct] = token.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("密文格式不正确");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, await aesKey(secret), fromB64url(ct));
  return dec.decode(pt);
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const randomId = (bytes = 8) => b64url(crypto.getRandomValues(new Uint8Array(bytes))).replace(/[-_]/g, "x");
/** 输出地址密钥：24 字节随机数（192 bit），不可猜。 */
export const randomSecret = () => b64url(crypto.getRandomValues(new Uint8Array(24)));
