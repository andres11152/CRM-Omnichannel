import { getProxyAgent } from "../src/utils/proxy";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

describe("Proxy Agent Utility", () => {
  it("should return undefined if no proxy URL is provided", () => {
    const agent = getProxyAgent(null);
    expect(agent).toBeUndefined();

    const agentEmpty = getProxyAgent("");
    expect(agentEmpty).toBeUndefined();

    const agentUndef = getProxyAgent(undefined);
    expect(agentUndef).toBeUndefined();
  });

  it("should return a SocksProxyAgent for socks5:// protocols", () => {
    const proxyUrl = "socks5://localhost:1080";
    const agent = getProxyAgent(proxyUrl);
    expect(agent).toBeInstanceOf(SocksProxyAgent);
  });

  it("should return a SocksProxyAgent for socks:// protocols", () => {
    const proxyUrl = "socks://localhost:1080";
    const agent = getProxyAgent(proxyUrl);
    expect(agent).toBeInstanceOf(SocksProxyAgent);
  });

  it("should return an HttpsProxyAgent for http:// protocols", () => {
    const proxyUrl = "http://localhost:8080";
    const agent = getProxyAgent(proxyUrl);
    expect(agent).toBeInstanceOf(HttpsProxyAgent);
  });

  it("should return an HttpsProxyAgent for https:// protocols", () => {
    const proxyUrl = "https://localhost:8080";
    const agent = getProxyAgent(proxyUrl);
    expect(agent).toBeInstanceOf(HttpsProxyAgent);
  });

  it("should handle invalid proxy URLs gracefully and return undefined", () => {
    const proxyUrl = "not-a-valid-url";
    const agent = getProxyAgent(proxyUrl);
    expect(agent).toBeUndefined();
  });
});
