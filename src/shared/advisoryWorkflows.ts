import { z } from "zod";

/**
 * One advisory workflow (docs/forge.md, "Advisory workflows"): a workflow
 * file of the project's own, by its path in the repository, the way GitHub
 * names it on each of its runs (`path`). GitHub runs only the files directly
 * in `.github/workflows`, so no other path names a workflow.
 */
export const advisoryWorkflowSchema = z
  .string()
  .trim()
  .regex(/^\.github\/workflows\/[^/\s]+\.ya?ml$/, {
    // i18n-exempt: served to the first mate's model; Settings shows its own words
    message:
      "name a workflow file directly in .github/workflows, such as .github/workflows/early-tests.yml",
  });

/** A project's advisory workflows, each once; an empty list names none. */
export const advisoryWorkflowsSchema = z
  .array(advisoryWorkflowSchema)
  .refine((paths) => new Set(paths).size === paths.length, {
    // i18n-exempt: served to the first mate's model; Settings shows its own words
    message: "name each advisory workflow once",
  });

/**
 * The workflow files a person typed into Settings → Projects, one per line
 * or separated by commas or spaces, each once and in the order typed.
 */
export function typedAdvisoryWorkflows(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((path) => path !== ""))];
}
