import type {
  FlowSessionState,
  FlowVariables,
  FlowNode,
  FlowStructure,
  FlowMediaResponse,
} from "@/types/flow.types";
import { replaceVariables } from "./utils/FlowUtils";
import { FlowAIHandler } from "./FlowAIHandler";
import { FlowCRMHandler } from "./FlowCRMHandler";
import { SendNodeHandler } from "./handlers/SendNodeHandler";
import { AskDataNodeHandler } from "./handlers/AskDataNodeHandler";
import { ConditionNodeHandler } from "./handlers/ConditionNodeHandler";
import { AssignAgentNodeHandler } from "./handlers/AssignAgentNodeHandler";
import { HandoffNodeHandler } from "./handlers/HandoffNodeHandler";
import { DelayNodeHandler } from "./handlers/DelayNodeHandler";
import { HttpRequestNodeHandler } from "./handlers/HttpRequestNodeHandler";
import { TagContactNodeHandler } from "./handlers/TagContactNodeHandler";
import { SendTemplateNodeHandler } from "./handlers/SendTemplateNodeHandler";

export class FlowNodeHandlers {
  private aiHandler: FlowAIHandler;
  private crmHandler: FlowCRMHandler;
  private sendNodeHandler: SendNodeHandler;
  private askDataNodeHandler: AskDataNodeHandler;
  private conditionNodeHandler: ConditionNodeHandler;
  private assignAgentNodeHandler: AssignAgentNodeHandler;
  private handoffNodeHandler: HandoffNodeHandler;
  private delayNodeHandler: DelayNodeHandler;
  private httpRequestNodeHandler: HttpRequestNodeHandler;
  private tagContactNodeHandler: TagContactNodeHandler;
  private sendTemplateNodeHandler: SendTemplateNodeHandler;

  constructor() {
    this.aiHandler = new FlowAIHandler();
    this.crmHandler = new FlowCRMHandler();
    this.sendNodeHandler = new SendNodeHandler();
    this.askDataNodeHandler = new AskDataNodeHandler();
    this.conditionNodeHandler = new ConditionNodeHandler();
    this.assignAgentNodeHandler = new AssignAgentNodeHandler();
    this.handoffNodeHandler = new HandoffNodeHandler();
    this.delayNodeHandler = new DelayNodeHandler();
    this.httpRequestNodeHandler = new HttpRequestNodeHandler();
    this.tagContactNodeHandler = new TagContactNodeHandler();
    this.sendTemplateNodeHandler = new SendTemplateNodeHandler();
  }

  async handleSendNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sessionId: string, currentNodeId: string, flowStructure: FlowStructure) => Promise<void>,
  ): Promise<string | FlowMediaResponse> {
    return this.sendNodeHandler.handle(node, session, flowStructure, moveToNextNode);
  }

  async handleAskDataNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    shouldConsumeInput: boolean,
    moveToNextNode: (sessionId: string, currentNodeId: string, flowStructure: FlowStructure, variables?: FlowVariables) => Promise<void>,
  ): Promise<string | null> {
    return this.askDataNodeHandler.handle(node, session, userMessage, flowStructure, shouldConsumeInput, moveToNextNode);
  }

  async handleConditionNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    moveToSpecificNode: (sessionId: string, targetNodeId: string, flowStructure: FlowStructure) => Promise<void>,
    endSession: (sessionId: string) => Promise<void>,
  ): Promise<string | null> {
    return this.conditionNodeHandler.handle(node, session, userMessage, flowStructure, moveToSpecificNode, endSession);
  }

  async handleAIAgentNode(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    moveToNextNode: (sessionId: string, currentNodeId: string, flowStructure: FlowStructure, variables?: FlowVariables) => Promise<void>,
  ): Promise<string> {
    return this.aiHandler.handleAIAgentNode(node, session, userMessage, flowStructure, moveToNextNode);
  }

  async handleCreateDealNode(
    node: FlowNode,
    session: FlowSessionState,
    companyId: string,
    flowStructure: FlowStructure,
    moveToNextNode: (sessionId: string, currentNodeId: string, flowStructure: FlowStructure) => Promise<void>,
  ): Promise<string | null> {
    return this.crmHandler.handleCreateDealNode(node, session, companyId, flowStructure, moveToNextNode);
  }

  async handleUpdateContactNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sessionId: string, currentNodeId: string, flowStructure: FlowStructure) => Promise<void>,
  ): Promise<string | null> {
    return this.crmHandler.handleUpdateContactNode(node, session, flowStructure, moveToNextNode);
  }

  async handleAssignAgentNode(
    node: FlowNode,
    session: FlowSessionState,
    conversationId: string,
    endSession: (sessionId: string) => Promise<void>,
  ): Promise<string | null> {
    return this.assignAgentNodeHandler.handle(node, session, conversationId, endSession);
  }

  async handleHandoffNode(
    node: FlowNode,
    session: FlowSessionState,
    conversationId: string,
    endSession: (sessionId: string) => Promise<void>,
  ): Promise<string> {
    return this.handoffNodeHandler.handle(node, session, conversationId, endSession);
  }

  async handleDelayNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sessionId: string, currentNodeId: string, flowStructure: FlowStructure) => Promise<void>,
  ): Promise<string | null> {
    return this.delayNodeHandler.handle(node, session, flowStructure, moveToNextNode);
  }

  async handleHttpRequestNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sessionId: string, currentNodeId: string, flowStructure: FlowStructure, variables?: FlowVariables) => Promise<void>,
  ): Promise<string | null> {
    return this.httpRequestNodeHandler.handle(node, session, flowStructure, moveToNextNode);
  }

  async handleTagContactNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sessionId: string, currentNodeId: string, flowStructure: FlowStructure) => Promise<void>,
  ): Promise<string | null> {
    return this.tagContactNodeHandler.handle(node, session, flowStructure, moveToNextNode);
  }

  async handleSendTemplateNode(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sessionId: string, currentNodeId: string, flowStructure: FlowStructure) => Promise<void>,
  ): Promise<string | null> {
    return this.sendTemplateNodeHandler.handle(node, session, flowStructure, moveToNextNode);
  }

  replaceVariables(text: string, variables: FlowVariables): string {
    return replaceVariables(text, variables);
  }
}
