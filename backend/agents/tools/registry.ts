import type { Tool, ToolContext } from "./types.ts";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register<TArgs extends Record<string, unknown>, TOut>(tool: Tool<TArgs, TOut>): void {
    this.tools.set(tool.name, tool as unknown as Tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  /** OpenAI-style tool descriptors. Optional `allowed` filters by name. */
  asOpenAI(allowed?: Set<string>): Array<{ type: "function"; function: { name: string; description: string; parameters: unknown } }> {
    return this.list()
      .filter((t) => !allowed || allowed.has(t.name))
      .map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
  }

  async run(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return await tool.execute(args, ctx);
  }
}
