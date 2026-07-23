import packageJson from "../package.json";
import * as clientEntrypoint from "../src/entrypoints/client";
import * as httpEntrypoint from "../src/entrypoints/http";

describe("client entrypoints", () => {
  it("keeps the package root aligned with the client entrypoint", () => {
    expect(packageJson.exports["."]).toEqual(packageJson.exports["./client"]);
  });

  it("does not expose createHttpClient from the vrpc client entrypoint", () => {
    expect("createHttpClient" in clientEntrypoint).toBe(false);
  });

  it("keeps createHttpClient on the dedicated http entrypoint", () => {
    expect(httpEntrypoint.createHttpClient).toBeTypeOf("function");
  });

  it("exposes one error guard for each client entrypoint", () => {
    expect(clientEntrypoint.isVrpcError).toBeTypeOf("function");
    expect(httpEntrypoint.isHttpError).toBeTypeOf("function");
    expect("isAbortError" in clientEntrypoint).toBe(false);
    expect("isAbortError" in httpEntrypoint).toBe(false);
  });

  it("does not expose a parse error for lenient generic HTTP parsing", () => {
    expect("HttpParseError" in clientEntrypoint).toBe(false);
    expect("HttpParseError" in httpEntrypoint).toBe(false);
  });

  it("only publishes client and http entrypoints", () => {
    expect(Object.keys(packageJson.exports)).toEqual([".", "./client", "./http"]);
  });
});
