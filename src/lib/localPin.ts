const ITERATIONS = 180_000

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(value: string) {
  return new Uint8Array(value.match(/.{2}/g)?.map(byte => Number.parseInt(byte, 16)) ?? [])
}

async function derive(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const saltBuffer = salt.slice().buffer as ArrayBuffer
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations: ITERATIONS }, material, 256))
}

export async function makePinVerifier(pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must contain exactly four digits.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pin, salt)
  return `${bytesToHex(salt)}.${bytesToHex(hash)}`
}

export async function checkPin(pin: string, verifier: string) {
  const [saltHex, hashHex] = verifier.split('.')
  if (!saltHex || !hashHex || !/^\d{4}$/.test(pin)) return false
  const candidate = await derive(pin, hexToBytes(saltHex))
  const expected = hexToBytes(hashHex)
  if (candidate.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < candidate.length; i += 1) difference |= candidate[i] ^ expected[i]
  return difference === 0
}
