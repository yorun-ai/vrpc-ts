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

  it("only publishes client and http entrypoints", () => {
    expect(Object.keys(packageJson.exports)).toEqual([".", "./client", "./http"]);
  });
});
