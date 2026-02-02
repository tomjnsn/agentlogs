import { describe, expect, test } from "bun:test";
import { redactSecretsDeep, redactSecretsPreserveLength } from "./redact";

describe("redactSecretsPreserveLength", () => {
  test("masks known secrets while preserving string length", () => {
    const secret = "sk-1234567890abcdef1234";
    const input = `{"value":"${secret}"}`;

    const output = redactSecretsPreserveLength(input);

    expect(output.length).toBe(input.length);
    expect(output).toBe(`{"value":"${"*".repeat(secret.length)}"}`);
  });

  test("uses first character of placeholder and falls back to default when empty", () => {
    const secret = "sk-1234567890abcdef1234";

    const xMasked = redactSecretsPreserveLength(secret, "XYZ");
    expect(xMasked).toBe("X".repeat(secret.length));

    const defaultMasked = redactSecretsPreserveLength(secret, "");
    expect(defaultMasked).toBe("*".repeat(secret.length));
  });
});

describe("redactSecretsDeep", () => {
  test("redacts nested strings while preserving arrays and Date instances", () => {
    const secret = "sk-1234567890abcdef1234";
    const createdAt = new Date("2026-01-01T00:00:00Z");

    const input = {
      label: "safe",
      payload: {
        token: secret,
        items: ["ok", secret],
      },
      createdAt,
      count: 2,
    };

    const output = redactSecretsDeep(input);

    expect(output).not.toBe(input);
    expect(output.label).toBe("safe");
    expect(output.payload.token).toBe("*".repeat(secret.length));
    expect(output.payload.items).toEqual(["ok", "*".repeat(secret.length)]);
    expect(output.createdAt).toBe(createdAt);
    expect(output.count).toBe(2);
  });
});
