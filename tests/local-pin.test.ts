import { describe, expect, it } from 'vitest'
import { checkPin, makePinVerifier } from '../src/lib/localPin'

describe('device PIN verifier', () => {
  it('stores a salted verifier and accepts only its four-digit PIN', async () => {
    const verifier = await makePinVerifier('0427')
    expect(verifier).toMatch(/^[a-f0-9]{32}\.[a-f0-9]{64}$/)
    expect(await checkPin('0427', verifier)).toBe(true)
    expect(await checkPin('1111', verifier)).toBe(false)
  })

  it('rejects malformed PINs', async () => {
    await expect(makePinVerifier('427')).rejects.toThrow('exactly four digits')
    expect(await checkPin('42x7', 'bad')).toBe(false)
  })
})
