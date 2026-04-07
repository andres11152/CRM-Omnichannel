import { Logger } from "@/utils/logger";

/**
 *  TEMPLATE RENDERING SERVICE
 *
 * Handles dynamic template rendering by replacing variables with actual values.
 * Supports multiple variable formats:
 * - {{1}}, {{2}}, {{3}} - Numbered placeholders
 * - {{name}}, {{email}}, {{order_id}} - Named placeholders
 *
 * @example
 * renderTemplate("Hola {{name}}, tu pedido {{order_id}} está listo", {
 *   name: "Juan",
 *   order_id: "12345"
 * })
 * // Returns: "Hola Juan, tu pedido 12345 está listo"
 */

export interface TemplateParameters {
  [key: string]: string | number;
}

/**
 * Render template by replacing variables with actual values
 *
 * @param content - Template content with variables (e.g., "Hello {{name}}")
 * @param parameters - Object  with variable values (e.g., {name: "John"})
 * @returns Rendered content with variables replaced
 *
 * @example
 * // Named variables
 * renderTemplate("Hola {{name}}", { name: "Juan" })
 * // Returns: "Hola Juan"
 *
 * // Numbered variables
 * renderTemplate("Tu código es {{1}}", { "1": "ABC123" })
 * // Returns: "Tu código es ABC123"
 *
 * // Multiple variables
 * renderTemplate("Hola {{name}}, tu pedido {{order_id}} llega el {{date}}", {
 *   name: "María",
 *   order_id: "12345",
 *   date: "15 de enero"
 * })
 * // Returns: "Hola María, tu pedido 12345 llega el 15 de enero"
 */
export function renderTemplate(
  content: string,
  parameters: TemplateParameters = {},
): string {
  try {
    // Track which parameters were used
    const usedParams: Set<string> = new Set();

    // Replace all {{variable}} patterns with their values
    const rendered = content.replace(
      /\{\{([a-zA-Z0-9_]+)\}\}/g,
      (match, variableName) => {
        // Mark parameter as used
        usedParams.add(variableName);

        // Get value from parameters
        const value = parameters[variableName];

        // If parameter exists, use it; otherwise keep the placeholder
        if (value !== undefined && value !== null) {
          return String(value);
        }

        // Log warning for missing parameter
        Logger.warn(
          `[Template] Missing parameter: ${variableName} in template. Keeping placeholder.`,
        );

        return match; // Keep original {{variable}} if no value provided
      },
    );

    // Log unused parameters (might indicate typos)
    const unusedParams = Object.keys(parameters).filter(
      (key) => !usedParams.has(key),
    );

    if (unusedParams.length > 0) {
      Logger.warn(
        `[Template] Unused parameters: ${unusedParams.join(
          ", ",
        )}. Check for typos.`,
      );
    }

    return rendered;
  } catch (error) {
    Logger.error("[Template] Error rendering template:", error);
    throw new Error("Failed to render template");
  }
}

/**
 * Extract variable names from template content
 *
 * @param content - Template content
 * @returns Array of variable names found in template
 *
 * @example
 * extractVariables("Hola {{name}}, tu código es {{code}}")
 * // Returns: ["name", "code"]
 */
export function extractVariables(content: string): string[] {
  const variablePattern = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = variablePattern.exec(content)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  return variables;
}

/**
 * Validate that all required variables are provided
 *
 * @param content - Template content
 * @param parameters - Provided parameters
 * @returns Object with validation result and missing variables
 *
 * @example
 * validateParameters("Hello {{name}} {{surname}}", { name: "John" })
 * // Returns: { valid: false, missing: ["surname"] }
 */
export function validateParameters(
  content: string,
  parameters: TemplateParameters,
): {
  valid: boolean;
  missing: string[];
  extra: string[];
} {
  const requiredVariables = extractVariables(content);
  const providedVariables = Object.keys(parameters);

  const missing = requiredVariables.filter(
    (variable) => !(variable in parameters),
  );

  const extra = providedVariables.filter(
    (variable) => !requiredVariables.includes(variable),
  );

  return {
    valid: missing.length === 0,
    missing,
    extra,
  };
}

/**
 * Render template components (for WhatsApp Business API)
 *
 * @param components - WhatsApp template components
 * @param parameters - Parameters to render
 * @returns Rendered components
 */
export function renderTemplateComponents(
  components: Record<string, unknown>[],
  parameters: TemplateParameters = {},
): Record<string, unknown>[] {
  return components.map((component) => {
    // Only render text-based components
    if (component.text) {
      return {
        ...component,
        text: renderTemplate(String(component.text), parameters),
      };
    }

    // Return non-text components as-is
    return component;
  });
}

/**
 * Get human-readable preview of template with sample data
 *
 * @param content - Template content
 * @param sampleData - Sample data for preview (optional)
 * @returns Preview text
 *
 * @example
 * getTemplatePreview("Hola {{name}}, bienvenido!")
 * // Returns: "Hola [name], bienvenido!"
 */
export function getTemplatePreview(
  content: string,
  sampleData?: TemplateParameters,
): string {
  if (sampleData) {
    return renderTemplate(content, sampleData);
  }

  // Replace variables with [variable_name] for preview
  return content.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, "[$1]");
}

/**
 * Create a template object from components
 * Useful for converting WhatsApp Business API format to simple text
 *
 * @param components - Template components
 * @returns Combined text from all components
 */
export function componentsToText(
  components: Record<string, unknown>[],
): string {
  const texts: string[] = [];

  for (const component of components) {
    if (component.type === "HEADER" && component.text) {
      texts.push(`*${component.text}*`); // Bold header
    } else if (component.type === "BODY" && component.text) {
      texts.push(component.text as string);
    } else if (component.type === "FOOTER" && component.text) {
      texts.push(`_${component.text}_`); // Italic footer
    }
  }

  return texts.join("\n\n");
}
