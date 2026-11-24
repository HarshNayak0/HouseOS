import { describe, expect, it } from "vitest";
import { pinProblem, validateVaultItem } from "../../supabase/functions/_shared/vault";
import { b64, decryptItem, encryptItem, hashPin, lockoutMs, newSalt, signedInRecently, verifyPin } from "../../supabase/functions/vault/logic";

const MASTER = b64(crypto.getRandomValues(new Uint8Array(32)));
const ID = "0f8c2b3e-1111-4222-8333-944455556666";

describe("vault envelope encryption", () => {
  it("round-trips and never stores plaintext", async () => {
    const fields = { network: "Veedu-5G", password: "mango-lassi-42" };
    const sealed = await encryptItem(ID, fields, MASTER);
    expect(sealed.ciphertext).not.toContain("mango");
    expect(atob(sealed.ciphertext)).not.toContain("mango");
    expect(await decryptItem(ID, sealed, MASTER)).toEqual(fields);
  });
  it("uses a fresh data key each time", async () => {
    const a = await encryptItem(ID, { x: "1" }, MASTER);
    const b = await encryptItem(ID, { x: "1" }, MASTER);
    expect(a.wrapped_dek).not.toBe(b.wrapped_dek);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it("fails with the wrong master key, a different item id, or tampered data", async () => {
    const sealed = await encryptItem(ID, { x: "1" }, MASTER);
    await expect(decryptItem(ID, sealed, b64(new Uint8Array(32).fill(7)))).rejects.toThrow();
    await expect(decryptItem("0f8c2b3e-1111-4222-8333-000000000000", sealed, MASTER)).rejects.toThrow();
    const bytes = Uint8Array.from(atob(sealed.ciphertext), (c) => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 1;
    await expect(decryptItem(ID, { ...sealed, ciphertext: b64(bytes) }, MASTER)).rejects.toThrow();
  });
  it("rejects a master key of the wrong size", async () => {
    await expect(encryptItem(ID, {}, b64(new Uint8Array(16)))).rejects.toThrow(/32/);
  });
});

describe("PINs", () => {
  it("hashes with salt and pepper and verifies", async () => {
    const salt = newSalt();
    const h = await hashPin("482913", salt, MASTER, 1000);
    expect(h).not.toContain("482913");
    expect(await verifyPin("482913", salt, h, MASTER)).toBe(true);
    expect(await verifyPin("482914", salt, h, MASTER)).toBe(false);
    // same PIN, different pepper (master key) → no match: a database copy alone can't be brute-forced
    expect(await verifyPin("482913", salt, h, b64(new Uint8Array(32).fill(1)))).toBe(false);
  });
  it("refuses weak PINs", () => {
    expect(pinProblem("1234")).toMatch(/6 digits/);
    expect(pinProblem("111111")).toMatch(/same digit/);
    expect(pinProblem("123456")).toMatch(/straight/);
    expect(pinProblem("654321")).toMatch(/straight/);
    expect(pinProblem("482913")).toBeNull();
  });
  it("pauses after 5, 10 and 15 wrong tries", () => {
    expect([1, 4, 5, 6, 10, 11, 15, 16].map(lockoutMs)).toEqual([0, 0, 900_000, 0, 3_600_000, 0, 86_400_000, 86_400_000]);
  });
  it("needs a recent sign-in to set up or reset", () => {
    const now = 1_800_000_000;
    expect(signedInRecently({ amr: [{ method: "oauth", timestamp: now - 60 }] }, now)).toBe(true);
    expect(signedInRecently({ amr: [{ method: "oauth", timestamp: now - 3600 }] }, now)).toBe(false);
    expect(signedInRecently({}, now)).toBe(false);
  });
});

describe("vault item validation", () => {
  it("keeps known fields, drops unknown ones and trims", () => {
    const v = validateVaultItem({ section: "wifi", label: " Home Wi-Fi ", fields: { network: " Veedu ", password: "p", evil: "x" } });
    expect(v).toEqual({ id: undefined, section: "wifi", label: "Home Wi-Fi", renewal_date: null, fields: { network: "Veedu", password: "p" } });
  });
  it("only lease and insurance keep a renewal date", () => {
    expect((validateVaultItem({ section: "insurance", label: "Tenant", renewal_date: "2027-03-01", fields: {} }) as { renewal_date: string }).renewal_date).toBe("2027-03-01");
    expect((validateVaultItem({ section: "wifi", label: "W", renewal_date: "2027-03-01", fields: {} }) as { renewal_date: null }).renewal_date).toBeNull();
  });
  it("rejects bad input", () => {
    expect(validateVaultItem({ section: "bank", label: "x" })).toBe("Unknown section");
    expect(validateVaultItem({ section: "wifi", label: "" })).toMatch(/Give it/);
    expect(validateVaultItem({ section: "account", label: "x", fields: { url: "javascript:alert(1)" } })).toMatch(/https/);
    expect(validateVaultItem({ section: "wifi", label: "x", fields: { password: "a".repeat(501) } })).toMatch(/too long/);
  });
});
