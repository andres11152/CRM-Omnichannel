import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { Agent } from "http";
import { Logger } from "@/utils/logger";

/**
 * Enforces a sticky session on residential/rotating proxies if the provider is recognized.
 * This appends the sessionId to the proxy username, pinning the connection to a single IP.
 */
export function enforceStickySession(proxyUrl: string, sessionId: string): string {
  try {
    const url = new URL(proxyUrl);
    if (!url.username) return proxyUrl;

    // Clean session ID for security and protocol cleanliness (alphanumeric only, max 16 chars)
    const cleanSessionId = sessionId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 16);

    // Apply specific session-pinning formats depending on the proxy provider
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
      // Generic fallback: many providers use user-session-ID format
      if (!url.username.includes("-session-") && !url.username.includes("-sessid-")) {
        url.username = `${url.username}-session-${cleanSessionId}`;
      }
    }

    return url.toString();
  } catch (err) {
    Logger.warn(`[Proxy] Failed to enforce sticky session on URL: ${proxyUrl}`, err);
    return proxyUrl;
  }
}

/**
 * Generates an HTTP/HTTPS or SOCKS agent for routing connection traffic through a proxy.
 * If sessionId is provided, it attempts to enforce sticky sessions.
 */
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
    Logger.error(`[Proxy] Failed to create proxy agent for URL: ${proxyUrl}`, error);
  }

  return undefined;
}

