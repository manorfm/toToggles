import { describe, expect, it } from "vitest";
import { TotoggleAuthenticationError, TotoggleConfigError } from "./errors.js";

describe("TotoggleConfigError", () => {
  it("is an Error with a descriptive message", () => {
    const err = new TotoggleConfigError("application name must not be blank");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TotoggleConfigError);
    expect(err.message).toBe("application name must not be blank");
    expect(err.name).toBe("TotoggleConfigError");
  });
});

describe("TotoggleAuthenticationError", () => {
  it("is an Error with a fixed, non-leaking message", () => {
    const err = new TotoggleAuthenticationError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TotoggleAuthenticationError);
    expect(err.name).toBe("TotoggleAuthenticationError");
    expect(err.message).not.toContain("sk_");
  });
});
