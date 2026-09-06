export type SecretEnvelope = {
  wrappedKey: string;
  iv: string;
  ciphertext: string;
};

let cachedPem = "";

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function pemToSpki(pem: string): ArrayBuffer {
  const b64pem = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64pem);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function publicPem(): Promise<string> {
  if (cachedPem) return cachedPem;
  const res = await fetch("/api/crypto/public-key");
  if (!res.ok) throw new Error("无法获取加密公钥");
  const body = (await res.json()) as { pem: string };
  cachedPem = body.pem;
  return cachedPem;
}

export async function encryptSecret(plain: string): Promise<SecretEnvelope> {
  const pem = await publicPem();
  const pub = await crypto.subtle.importKey(
    "spki",
    pemToSpki(pem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const rawAes = await crypto.subtle.exportKey("raw", aes);
  const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, rawAes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aes,
    new TextEncoder().encode(plain),
  );
  return {
    wrappedKey: b64(wrapped),
    iv: b64(iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength)),
    ciphertext: b64(ciphertext),
  };
}
