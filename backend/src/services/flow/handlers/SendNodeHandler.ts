import { FlowSessionState, FlowStructure, FlowNode, FlowMediaResponse } from "@/types/flow.types";
import { replaceVariables } from "../utils/FlowUtils";
import { Logger } from "@/utils/logger";

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export class SendNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sId: string, cId: string, fs: FlowStructure) => Promise<void>
  ): Promise<string | FlowMediaResponse> {
    const nodeType = node.type.toLowerCase();
    const replaceVars = (text: string) => replaceVariables(text, session.variables);

    let response: string | FlowMediaResponse;
    switch (nodeType) {
      case "send_message":
        response = replaceVars(node.data.message || node.data.content || node.data.text || "");
        break;
      case "send_image": {
        const imageUrl = replaceVars(node.data.mediaUrl || node.data.imageUrl || "");
        if (!isValidUrl(imageUrl)) Logger.warn(`[SendNode] send_image node ${node.id} has invalid URL: "${imageUrl}"`);
        response = {
          type: "image",
          url: imageUrl,
          message: node.data.message ? replaceVars(node.data.message) : undefined,
        };
        break;
      }
      case "send_video": {
        const videoUrl = replaceVars(node.data.mediaUrl || node.data.videoUrl || "");
        if (!isValidUrl(videoUrl)) Logger.warn(`[SendNode] send_video node ${node.id} has invalid URL: "${videoUrl}"`);
        response = {
          type: "video",
          url: videoUrl,
          message: node.data.message ? replaceVars(node.data.message) : undefined,
        };
        break;
      }
      case "send_audio": {
        const audioUrl = replaceVars(node.data.mediaUrl || node.data.audioUrl || "");
        if (!isValidUrl(audioUrl)) Logger.warn(`[SendNode] send_audio node ${node.id} has invalid URL: "${audioUrl}"`);
        response = {
          type: "audio",
          url: audioUrl,
        };
        break;
      }
      case "send_document": {
        const docUrl = replaceVars(node.data.mediaUrl || node.data.documentUrl || "");
        if (!isValidUrl(docUrl)) Logger.warn(`[SendNode] send_document node ${node.id} has invalid URL: "${docUrl}"`);
        response = {
          type: "document",
          url: docUrl,
          filename: node.data.filename ? replaceVars(node.data.filename) : undefined,
        };
        break;
      }
      default:
        response = replaceVars(node.data.message || node.data.content || "");
    }

    await moveToNextNode(session.id, node.id, flowStructure);
    return response;
  }
}
