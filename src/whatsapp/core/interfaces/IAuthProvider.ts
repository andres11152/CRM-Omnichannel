import {
  AuthenticationState,
  SignalDataTypeMap,
  AuthenticationCreds,
} from "@whiskeysockets/baileys";

export interface IAuthProvider {
  loadState(
    sessionId: string,
  ): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }>;
  saveCredentials(sessionId: string, creds: AuthenticationCreds): Promise<void>;
  clearCredentials(sessionId: string): Promise<void>;
}
