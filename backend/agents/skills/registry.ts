import type { AgentRunInput } from "../core/types.ts";
import type { SkillManifest } from "./types.ts";

export class SkillRegistry {
  private skills = new Map<string, SkillManifest>();

  register(skill: SkillManifest): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): SkillManifest | undefined {
    return this.skills.get(name);
  }

  list(): SkillManifest[] {
    return [...this.skills.values()];
  }

  match(input: AgentRunInput): SkillManifest[] {
    if (input.skillIds && input.skillIds.length > 0) {
      return input.skillIds
        .map((id) => this.skills.get(id))
        .filter((s): s is SkillManifest => Boolean(s));
    }
    return this.list().filter((s) => (s.match ? s.match(input) : true));
  }
}
