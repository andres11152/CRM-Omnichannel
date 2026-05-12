import { FlowSessionState, FlowStructure, FlowNode, FlowMediaResponse } from "@/types/flow.types";
import { replaceVariables } from "../utils/FlowUtils";

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
      case "send_image":
        response = {
          type: "image",
          url: replaceVars(node.data.mediaUrl || node.data.imageUrl || ""),
          message: node.data.message ? replaceVars(node.data.message) : undefined,
        };
        break;
      case "send_video":
        response = {
          type: "video",
          url: replaceVars(node.data.mediaUrl || node.data.videoUrl || ""),
          message: node.data.message ? replaceVars(node.data.message) : undefined,
        };
        break;
      case "send_audio":
        response = {
          type: "audio",
          url: replaceVars(node.data.mediaUrl || node.data.audioUrl || ""),
        };
        break;
      case "send_document":
        response = {
          type: "document",
          url: replaceVars(node.data.mediaUrl || node.data.documentUrl || ""),
          filename: node.data.filename ? replaceVars(node.data.filename) : undefined,
        };
        break;
      default:
        response = replaceVars(node.data.message || node.data.content || "");
    }

    await moveToNextNode(session.id, node.id, flowStructure);
    return response;
  }
}
