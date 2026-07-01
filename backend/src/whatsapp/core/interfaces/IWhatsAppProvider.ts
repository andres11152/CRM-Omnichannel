export interface IWhatsAppProvider {
  /**
   * Send a message to a recipient.
   * @param sessionId The session identifier
   * @param to The recipient JID or phone number
   * @param content The message body or structured payload
   * @param options Optional parameter containing formatting/metadata
   */
  sendMessage(
    sessionId: string,
    to: string,
    content: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;

  /**
   * Send a presence update (e.g. typing / recording).
   * @param sessionId The session identifier
   * @param to The recipient JID or phone number
   * @param type The presence type ('composing', 'recording', 'paused')
   */
  sendPresenceUpdate(
    sessionId: string,
    to: string,
    type: "composing" | "recording" | "paused",
  ): Promise<void>;
}
