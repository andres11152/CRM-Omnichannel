import { SocksProxyAgent } from "socks-proxy-agent";
// @ts-ignore
import { HttpsProxyAgent } from "https-proxy-agent";
import { Agent } from "http";
import { Logger } from "./logger";

export function enforceStickySession(proxyUrl: string, sessionId: string): string {
  try {
    const url = new URL(proxyUrl);
    if (!url.username) return proxyUrl;

    const cleanSessionId = sessionId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 16);

    if (url.hostname.includes("lum-superproxy.io") || url.hostname.includes("brightdata")) {
      if (!url.username.includes("-session-")) {
        url.username = `${url.username}-session-${cleanSessionId}`;
      }
    } else if (url.hostname.includes("oxylabs")) {
      if (!url.username.includes("-sessid-")) {
        url.username = `${url.username}-sessid-${cleanSessionId}`;
      }
    } else if (url.hostname.includes("webshare")) {
      if (!url.username.includes("-session-")) {
        url.username = `${url.username}-session-${cleanSessionId}`;
      }
    } else {
      if (!url.username.includes("-session-") && !url.username.includes("-sessid-")) {
        url.username = `${url.username}-session-${cleanSessionId}`;
      }
    }

    return url.toString();
  } catch (err) {
    Logger.warn(err, `[Proxy] Failed to enforce sticky session on URL: ${proxyUrl}`);
    return proxyUrl;
  }
}

export function getProxyAgent(proxyUrl?: string | null, sessionId?: string): Agent | undefined {
  if (!proxyUrl) return undefined;

  try {
    const finalProxyUrl = sessionId ? enforceStickySession(proxyUrl, sessionId) : proxyUrl;
    const url = new URL(finalProxyUrl);
    
    if (url.protocol.startsWith("socks")) {
      Logger.debug(`[Proxy] Creating SocksProxyAgent for session: ${url.host} (Sticky: ${!!sessionId})`);
      return new SocksProxyAgent(finalProxyUrl) as unknown as Agent;
    } else if (url.protocol.startsWith("http")) {
      Logger.debug(`[Proxy] Creating HttpsProxyAgent for session: ${url.host} (Sticky: ${!!sessionId})`);
      return new HttpsProxyAgent(finalProxyUrl) as unknown as Agent;
    } else {
      Logger.warn(`[Proxy] Unsupported proxy protocol: ${url.protocol}`);
    }
  } catch (error) {
    Logger.error(error, `[Proxy] Failed to create proxy agent for URL: ${proxyUrl}`);
  }

  return undefined;
}
