import { FlowSessionState, FlowStructure, FlowNode } from "@/types/flow.types";
import { Logger } from "@/utils/logger";

export class ConditionNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    userMessage: string,
    flowStructure: FlowStructure,
    moveToSpecificNode: (sId: string, tId: string, fs: FlowStructure) => Promise<void>,
    endSession: (sId: string) => Promise<void>
  ): Promise<string | null> {
    const conditions = node.data.conditions || [];
    const variable = node.data.conditionVariable || node.data.variable || "last_response";
    const valueToCheck = String(session.variables[variable] !== undefined ? session.variables[variable] : userMessage);

    if (conditions.length > 0) {
      for (const condition of conditions) {
        const { operator, value, targetHandle } = condition;

        let matched = false;
        const numA = parseFloat(valueToCheck);
        const numB = parseFloat(value);
        switch (operator) {
          case "equals":
            matched = valueToCheck.toLowerCase() === value.toLowerCase();
            break;
          case "contains":
            matched = valueToCheck.toLowerCase().includes(value.toLowerCase());
            break;
          case "starts_with":
            matched = valueToCheck.toLowerCase().startsWith(value.toLowerCase());
            break;
          case "ends_with":
            matched = valueToCheck.toLowerCase().endsWith(value.toLowerCase());
            break;
          case "regex":
            try { matched = new RegExp(value, "i").test(valueToCheck); } catch { matched = false; }
            break;
          case "is_empty":
            matched = valueToCheck.trim().length === 0;
            break;
          case "greater_than":
            matched = !isNaN(numA) && !isNaN(numB) && numA > numB;
            break;
          case "less_than":
            matched = !isNaN(numA) && !isNaN(numB) && numA < numB;
            break;
        }

        if (matched) {
          const edge = flowStructure.edges.find(
            (e) => e.source === node.id && e.sourceHandle === targetHandle,
          );

          if (edge) {
            await moveToSpecificNode(session.id, edge.target, flowStructure);
            return null;
          }
        }
      }

      const defaultEdge = flowStructure.edges.find(
        (e) => e.source === node.id && !e.sourceHandle,
      );

      if (defaultEdge) {
        await moveToSpecificNode(session.id, defaultEdge.target, flowStructure);
      } else {
        await endSession(session.id);
      }

      return null;
    }

    const operator = node.data.conditionOperator || "contains";
    const conditionValue = node.data.conditionValue || "";
    
    let conditionMet = false;
    const numA = parseFloat(valueToCheck);
    const numB = parseFloat(conditionValue);

    switch (operator) {
      case "equals":
        conditionMet = valueToCheck.toLowerCase() === conditionValue.toLowerCase();
        break;
      case "contains":
        conditionMet = valueToCheck.toLowerCase().includes(conditionValue.toLowerCase());
        break;
      case "starts_with":
        conditionMet = valueToCheck.toLowerCase().startsWith(conditionValue.toLowerCase());
        break;
      case "ends_with":
        conditionMet = valueToCheck.toLowerCase().endsWith(conditionValue.toLowerCase());
        break;
      case "regex":
        try { conditionMet = new RegExp(conditionValue, "i").test(valueToCheck); } catch { conditionMet = false; }
        break;
      case "is_empty":
        conditionMet = valueToCheck.trim().length === 0;
        break;
      case "greater_than":
        conditionMet = !isNaN(numA) && !isNaN(numB) && numA > numB;
        break;
      case "less_than":
        conditionMet = !isNaN(numA) && !isNaN(numB) && numA < numB;
        break;
      case "exists":
        conditionMet = valueToCheck.trim().length > 0;
        break;
      default:
        conditionMet = valueToCheck.toLowerCase().includes(conditionValue.toLowerCase());
    }

    const targetLabel = conditionMet ? "TRUE" : "FALSE";
    
    const labelEdge = flowStructure.edges.find(
      (e) => e.source === node.id && e.label === targetLabel,
    );

    if (labelEdge) {
      Logger.info(`[FlowCondition] ${variable}="${valueToCheck}" ${operator} "${conditionValue}" → ${targetLabel}`);
      await moveToSpecificNode(session.id, labelEdge.target, flowStructure);
      return null;
    }

    const fallbackEdge = flowStructure.edges.find(
      (e) => e.source === node.id,
    );

    if (fallbackEdge) {
      await moveToSpecificNode(session.id, fallbackEdge.target, flowStructure);
    } else {
      Logger.warn(`[FlowCondition] No outgoing edge found for condition node ${node.id}. Ending session.`);
      await endSession(session.id);
    }

    return null;
  }
}
