import { COMPLETION_CARD_HEADINGS } from "@shared/cardHeadings";
import { describe, expect, it } from "vitest";
import { renderAnswerShapeSection } from "../orchestrator/intentBrief";
import {
  CLAUDE_TOOL_DESCRIPTION_CAP,
  CREWMATE_EMIT_CARD_DESCRIPTION,
} from "../prompts/cardContract";
import { PUBLIC_WRITING } from "../prompts/publicWriting";
import { CLAUDE_SEAT_TOOL_PREFIX } from "../storage/sessionReader";
import { CREWMATE_TOOLS } from "./crewmateTaskTools";
import { createCrewTools } from "./crewTools";
import { CHECK_CHANGE_TOOL_DESCRIPTION } from "./forgeTools";
import {
  buildCrewmateSystemPrompt,
  buildFirstmateSystemPrompt,
  CAPTAIN_PLACE_RULE,
  CREWMATE_TEST_DEFAULT,
  type CrewmateProcedureFacts,
  crewmateBackendNote,
  RIGOR_SAFETY,
} from "./piResources";

/**
 * The crewmate's served prompt: what every crewmate reads whatever its
 * backend, delivery, care or runbook, and each placement's own note. What
 * reaches every agent from one home is held in piResources.test.ts.
 */
describe("picture review reaches every crewmate", () => {
  it("serves visual inspection and truthful alt text independently of backend and evidence-folder placement", () => {
    for (const backend of [undefined, "pi", "claude"] as const) {
      for (const evidenceDir of [undefined, "/app/crewmates/abc12345/evidence"]) {
        const prompt = buildCrewmateSystemPrompt(backend, evidenceDir);
        const review = prompt.indexOf("Before putting any picture or demo poster on a card");
        expect(review).toBeGreaterThan(-1);
        // Outside the care guidance: quick and answer tasks get it too.
        expect(review).toBeLessThan(prompt.indexOf(RIGOR_SAFETY));
        expect(prompt).toContain("open it with your image-reading tool");
        expect(prompt).toContain("Write alt text from the file");
        expect(prompt).toContain("Retake one mostly blank, half-drawn or cut off");
        // INF-3814's direction B: the second look, as a person using the view, and the fix.
        expect(prompt).toContain("Then as a person using this view who has never seen your change");
        expect(prompt).toContain(
          "Fix every fault your change caused, retake it and give the new take both looks",
        );
        expect(prompt).toContain("unless intentional");
        expect(prompt).toContain("if intentional, say so in its alt text");
        expect(prompt).toContain(
          "If you cannot inspect it, leave it off the card and report the gap",
        );
      }
    }
  });
});

describe("where a crewmate keeps its evidence", () => {
  it("names the task's evidence folder in the instructions when the host gives one, and keeps evidence out of commits", () => {
    const evidenceDir = "/app/crewmates/abc12345/evidence";
    const prompt = buildCrewmateSystemPrompt("claude", evidenceDir);
    expect(prompt).toContain(`Your evidence folder is ${evidenceDir}`);
    expect(prompt).toContain("never inside your working copy");
    // The stranger rule keeps local paths and private details out of what the project shows (PUBLIC_WRITING).
    expect(prompt).toContain("Leave out addresses, folder paths, clock times");
    expect(buildCrewmateSystemPrompt("pi")).not.toContain("Your evidence folder is");
  });

  it("says the folder goes a week after the close, and asks for one copy of each download", () => {
    const prompt = buildCrewmateSystemPrompt("pi", "/app/crewmates/abc12345/evidence");
    expect(prompt).toContain("A week after your task closes, the app removes this folder");
    expect(prompt).toContain("belongs in your report or on a card");
    expect(prompt).toContain("Keep one copy of each download");
    expect(prompt).toContain("delete any copy of a database once you have read it");
  });

  it("commits a picture the repository's own instructions keep with the change, at every rigor level", () => {
    const keep =
      "A picture the repository's own instructions keep with the change, such as a release note's hero picture, is part of the change, not evidence: commit it where they say.";
    // Beside the standard tier's rule, and in the evidence folder line every tier reads.
    expect(buildCrewmateSystemPrompt("pi").split(keep)).toHaveLength(2);
    expect(
      buildCrewmateSystemPrompt("claude", "/app/crewmates/abc12345/evidence").split(keep),
    ).toHaveLength(3);
  });
});

describe("what a crewmate asks before", () => {
  // INF-3170, issue 6 (unnecessary approval escalations): only the extra work an
  // untrue goal would require waits on a card; fixing what the crewmate's own
  // change needs to pass is the change itself.
  it("asks only before the extra work an untrue goal would require, never before fixing its own change", () => {
    for (const backend of [undefined, "pi", "claude"] as const) {
      const prompt = buildCrewmateSystemPrompt(backend);
      expect(prompt).toContain(
        "Ask on a card before extra work the untrue goal would require: name the mismatch, change and earlier choices it reverses.",
      );
      expect(prompt).toContain(
        "Fixing what your own change needs to pass is part of it, not extra work.",
      );
    }
  });

  // INF-4362: an operation asked to merge past a branch rule merged from its
  // shell; it has no delivery, so the delivery paragraph never reached it.
  it("merges only through a merge card, never from its shell, whatever the kind of task", () => {
    const kinds: (CrewmateProcedureFacts | undefined)[] = [
      undefined,
      { delivery: "queue-pr", rigor: "standard" },
      { delivery: "local-only", rigor: "quick" },
      { delivery: "none", rigor: "none" },
    ];
    for (const backend of [undefined, "pi", "claude"] as const) {
      for (const kind of kinds) {
        const prompt = buildCrewmateSystemPrompt(
          backend,
          undefined,
          undefined,
          undefined,
          undefined,
          kind,
        );
        expect(prompt).toContain(
          "Never merge a pull request or push to a default branch from your shell, even when your goal names that merge",
        );
        expect(prompt).toContain("such as an admin merge the captain asks for");
      }
    }
  });
});

describe("asking before sensitive keychain access (INF-880, submitted answer 9)", () => {
  // The rule names the person's keychains and a project's own signing material
  // in words every project has; this repository's signing folders, setting and
  // test are its own and stay in its instructions (tests/served-boundary.test.ts).
  const rule = [
    "security, codesign",
    "consent on a card",
    "a project's own signing material",
    "scratch HOME",
  ];

  it("reaches every served crewmate prompt", () => {
    for (const backend of [undefined, "pi", "claude"] as const) {
      const prompt = buildCrewmateSystemPrompt(backend);
      for (const part of rule) expect(prompt, `${backend}: ${part}`).toContain(part);
      expect(prompt).toContain("a scratch HOME alone does not isolate the keychain search list");
      expect(prompt).toContain("Keep secrets off command lines and out of printed output");
    }
  });

  it("reaches the spawn_crewmate guidance the Firstmate reads, inside the Claude cap", () => {
    const spawn = (
      createCrewTools({} as never) as unknown as { name: string; description: string }[]
    ).find((tool) => tool.name === "spawn_crewmate");
    for (const part of rule) expect(spawn?.description, part).toContain(part);
    expect(spawn?.description).toContain("a secret in a command line");
    expect(spawn?.description.length).toBeLessThan(CLAUDE_TOOL_DESCRIPTION_CAP);
  });
});

describe("the audience rule (INF-2142's approved plan)", () => {
  it("reaches every crewmate once, whatever its backend, delivery, care or runbook", () => {
    // The captain's choices: every project but a local-only one, and every
    // kind of writing sent where the project lives, so no procedure fact or
    // runbook selection may drop it.
    const procedures: (CrewmateProcedureFacts | undefined)[] = [
      undefined,
      { delivery: "direct-pr", rigor: "standard" },
      { delivery: "direct-pr", rigor: "quick" },
      { delivery: "local-only", rigor: "reviewed" },
      { delivery: "none", rigor: "none" },
    ];
    for (const backend of [undefined, "pi", "claude"] as const) {
      for (const procedure of procedures) {
        for (const runbookText of [undefined, "# A selected runbook"]) {
          const prompt = buildCrewmateSystemPrompt(
            backend,
            undefined,
            undefined,
            undefined,
            undefined,
            procedure,
            undefined,
            undefined,
            undefined,
            undefined,
            runbookText,
          );
          const label = `${backend}: ${JSON.stringify(procedure)} ${runbookText ?? ""}`;
          expect(prompt.split(PUBLIC_WRITING).length - 1, label).toBe(1);
        }
      }
    }
    // The firstmate writes no story, so it is not served there.
    expect(buildFirstmateSystemPrompt()).not.toContain(PUBLIC_WRITING);
  });

  it("names what a story leaves out, its exemption and what publishable means", () => {
    for (const part of [
      "pull request stories and descriptions, commit messages, comments and releases",
      "Write for a stranger",
      "computer, host, user and account names",
      "clock times, time zones, other projects, task keys",
      "the captain's words to you",
      "A project living only on this computer sends nothing",
      "Set a story's publishable only after reading it once as that stranger.",
    ])
      expect(PUBLIC_WRITING, part).toContain(part);
    // A story carries no clock time, while cards, replies and reports keep them.
    const prompt = buildCrewmateSystemPrompt("claude");
    expect(prompt).toContain("Write times on cards, replies and reports");
    expect(prompt).toContain("A change story is the exception");
    expect(buildFirstmateSystemPrompt()).not.toContain("A change story is the exception");
  });
});

describe("the default rule on tests (FI3-1756, the captain's approved plan)", () => {
  it("reaches every crewmate once, whatever its backend, delivery or care", () => {
    // A test is written on every task that writes code, so no procedure
    // fact may drop the rule the way it drops the passages it does not need.
    const procedures: (CrewmateProcedureFacts | undefined)[] = [
      undefined,
      { delivery: "direct-pr", rigor: "standard" },
      { delivery: "direct-pr", rigor: "quick" },
      { delivery: "local-only", rigor: "reviewed" },
      { delivery: "none", rigor: "none" },
    ];
    for (const backend of [undefined, "pi", "claude"] as const) {
      for (const procedure of procedures) {
        const prompt = buildCrewmateSystemPrompt(
          backend,
          undefined,
          undefined,
          undefined,
          undefined,
          procedure,
        );
        const label = `${backend}: ${JSON.stringify(procedure)}`;
        expect(prompt.split(CREWMATE_TEST_DEFAULT).length - 1, label).toBe(1);
      }
    }
  });

  it("names the six words, governs repaired tests too, and yields to the project's own rule", () => {
    expect(CREWMATE_TEST_DEFAULT).toMatch(
      /^Tests follow six words: intent, fixture, failure, layer, owner and gate\./,
    );
    let last = -1;
    for (const word of ["Intent:", "Fixture:", "Failure:", "Layer:", "Owner:", "Gate:"]) {
      const at = CREWMATE_TEST_DEFAULT.indexOf(word);
      expect(at, word).toBeGreaterThan(last);
      last = at;
    }
    expect(CREWMATE_TEST_DEFAULT).toContain("no other test is written");
    // The captain's follow-up: the rule covers fixing and changing an
    // existing test, not only writing a new one.
    for (const rule of [
      "A failing test is a bug report first: diagnose the cause before touching its expectation.",
      "A test that fails only because the product changed on purpose is re-typed only when it serves a stated intent, and is otherwise deleted",
      "with no retry or sleep",
      // INF-2394 measure 5, the captain's approved fifth ruling (INF-2405),
      // in the words INF-2424 trimmed to fit the fixed context: a test,
      // helper or stand-in a change edits, a repaired one included, meets
      // the six words in that pull request, and deleting one that was there
      // before the change still asks (INF-6552's approved plan).
      "Bring each test file, helper or stand-in you edit to the six words in the same pull request, moving stand-ins to their owner; deleting a test that was there before your change still asks for the captain's approval.",
      // INF-6552's approved plan: a test the change adds that cannot fail is
      // its builder's to repair, never a question for the captain.
      "A test your change adds that you cannot make fail is yours to repair before you report: make it able to fail, or cut its name and checks to what it proves, and say which.",
      "Name patterns elsewhere in your report, never fixing or copying them.",
      // INF-840, the captain's direction 2: a change's own test is never a
      // suspected flake, and its crewmate repeats it locally before the card.
      "A test whose own code your change adds or edits is never a suspected flake",
      "ten times in a row for unit tests and end-to-end tests and three times on each device for device tests, with no retries, and report the passes.",
    ]) {
      expect(CREWMATE_TEST_DEFAULT, rule).toContain(rule);
    }
    // A default for every user, never a hard mandate: the project's own rule wins.
    expect(
      CREWMATE_TEST_DEFAULT.endsWith("The project's own rule on tests wins over this passage."),
    ).toBe(true);
  });
});

describe("buildCrewmateSystemPrompt (contract v2.0: policy only, one note per backend)", () => {
  it("runs a program the captain asks for, and keeps a named rule on the crewmate's own choices (INF-205)", () => {
    const prompt = buildCrewmateSystemPrompt();
    expect(prompt).toContain(
      "When the captain's own words ask you to run a program (their verbatim words in the brief, a reply under your card, a line in the task's Crewmate tab, or a written-in card answer), run it. A rule here that names a program, a sign-in or the keychain governs your own choices, never those words.",
    );
    expect(prompt).toContain("Keep secrets off command lines and out of printed output.");
  });

  it("names the captain's computers to every crewmate once one runs work (INF-992)", () => {
    // The captain on INF-992: "make sure crewmates are aware of the machines
    // the user has, and would escalate to first mate when the task requires
    // touching another machine".
    const prompt = (computers?: Parameters<typeof buildCrewmateSystemPrompt>[7]) =>
      buildCrewmateSystemPrompt(
        "claude",
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        computers,
      );
    const mini = { name: "Kun's Mac mini" };
    const atHome = prompt({ workers: [mini] });
    expect(atHome).toContain(
      "The captain's computers: the computer where your first mate lives, which keeps the task record and every project's folder; Kun's Mac mini, which runs work. This task runs on the computer where your first mate lives.",
    );
    expect(atHome).toContain(
      "A file, folder, program or action on another of these computers is out of your reach: report it with needs_firstmate",
    );
    expect(atHome).toContain("never ask the captain to move it");
    // INF-2422: a screenshot on another computer is said plainly, never answered as if seen.
    expect(atHome).toContain(
      "Until it reaches you, say plainly that you could not open it, and never answer as if you had: a picture the captain's words name by its path on another computer is such a file.",
    );
    expect(atHome).toContain("never print, quote or paste its content");
    // The session audit's finding 5: a card that needs the captain at one of
    // them says which one they are using now, and a click from another stops a wait.
    expect(atHome).toContain(CAPTAIN_PLACE_RULE);
    expect(prompt()).not.toContain(CAPTAIN_PLACE_RULE);
    expect(prompt({ here: mini.name, workers: [mini] })).toContain(
      "This task runs on Kun's Mac mini, so a project folder's path names nothing on Kun's Mac mini.",
    );
    expect(prompt({ workers: [{ name: "Builder", sameComputer: true }] })).toContain(
      "Builder, another user on the computer where your first mate lives, which runs work.",
    );
    // With one computer there is no other to know of.
    expect(prompt({ workers: [] })).not.toContain("The captain's computers");
    expect(prompt()).not.toContain("The captain's computers");
  });

  it("names the files command in the computers paragraph once its shell has it (INF-2468)", () => {
    // The captain on INF-2468: "isn't this fundamentally about a file
    // transport protocol between infinitary connected machines?"
    const prompt = (files: boolean) =>
      buildCrewmateSystemPrompt(
        "claude",
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        {
          here: "Kun's Mac mini",
          workers: [{ name: "Kun's Mac mini" }],
          ...(files ? { files } : {}),
        },
      );
    const reaching = prompt(true);
    expect(reaching).toContain(
      "To read a file on another of these computers, copy it with infinitary-files-axi in your shell: `ls <computer>:<folder>` lists a folder, `get <computer>:<path>` copies one file into your hand-over folder and prints its path, and the bare command names each computer.",
    );
    expect(reaching).toContain(
      "A program or action on another of these computers, or a file that command refuses, is out of your reach: report it with needs_firstmate",
    );
    expect(reaching).toContain(
      "a picture the captain's words name by its path on another computer reaches you only once you copy it.",
    );
    expect(reaching).toContain(
      "A handed or copied file may hold secrets: never print, quote or paste its content",
    );
    expect(reaching).not.toContain(
      "A file, folder, program or action on another of these computers",
    );
    expect(prompt(false)).not.toContain("infinitary-files-axi");
    expect(prompt(false)).toContain(
      "A file, folder, program or action on another of these computers is out of your reach",
    );
  });

  it("tells a crewmate to hand the captain files on its card only where its emit_card takes them (INF-3757)", () => {
    // The captain on INF-3757: "whenever we hand a file to the captain, we should
    // make sure it's always on the captain's current computer"; an older work
    // computer's emit_card has no files, so its crewmate keeps the old way.
    const prompt = (cardFiles?: false) =>
      buildCrewmateSystemPrompt(
        "claude",
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        "/work/tasks/t1/temp",
        {
          here: "Kun's Mac mini",
          workers: [{ name: "Kun's Mac mini" }],
          ...(cardFiles === false ? { cardFiles } : {}),
        },
      );
    const current = prompt();
    expect(current).toContain(
      "A file for the captain to open, edit, attach or send rides your card's files, which the captain saves on the computer in use: never name its path for the captain",
    );
    expect(current).toContain("a file for the captain rides your card's files");
    const older = prompt(false);
    expect(older).not.toContain("card's files");
    expect(older).toContain("To hand files to another task, pass their paths in report files.");
  });

  it("briefs itself on the record, not in message text (ruling D5)", () => {
    const prompt = buildCrewmateSystemPrompt();
    expect(prompt).toContain("Your task's structured intent gives");
    expect(prompt).toContain("The user's words outrank every elaboration, including yours.");
    expect(prompt).toContain(
      "Record the brief and acceptance plan with note_progress, not message text (a report)",
    );
    expect(CREWMATE_TOOLS.find((tool) => tool.name === "note_progress")?.description).toContain(
      "the final report leaves every item done or skipped",
    );
    expect(prompt).not.toContain("Put this self-brief at the top of your first message");
  });

  it("keeps the card admission rule and points at emit_card for the contract", () => {
    const prompt = buildCrewmateSystemPrompt();
    expect(prompt).toContain(
      "A card is only allowed when: 1. work cannot move forward without a captain decision, or 2. the captain cannot move forward without seeing that fact.",
    );
    expect(prompt).toContain("Follow emit_card's contract for the outcome card");
    // Putting a card away grants neither permission nor a task ending;
    // ordinary-read acknowledgement is covered through both served runtimes.
    expect(prompt).toContain("Putting a card away grants no permission and ends no task.");
    expect(prompt).not.toContain("Closing your completion card keeps you idle and steerable.");
    expect(prompt).not.toContain("Body must name the repo");
    expect(prompt).not.toContain("Merge PR");
    // Questions are named form controls a footer click sends (contract
    // 4.22), and a playable preview's settings ride the same click.
    expect(prompt).toContain("Never call inf.action from a control");
    // Contract 4.56 (FI3-517 direction A): choices arrive unpicked with the
    // recommendation marked, never checked for the captain.
    expect(prompt).toContain("Radio, checkbox and select answers arrive unpicked");
    expect(prompt).toContain('Open selects on <option value="">Choose</option>');
    expect(prompt).toContain(
      "mark recommended inputs or options data-inf-recommended, tagging them without picking them",
    );
    expect(prompt).toContain("Text fields keep prefilled text.");
    // INF-2715: each question sits in the section it is about, and a new
    // task's choice is file (the backlog) or start.
    expect(prompt).toContain(
      "A decision asks each question in its finding or section, never a closing list",
    );
    expect(prompt).toContain("offering both for each proposed task");
    expect(prompt).toContain("the default after required answers, others whatever is picked");
    expect(prompt).not.toContain("check or select the option you propose");
    // A preview's rules reach an answer task in its answer-shape section
    // (INF-6570's budget card), not every crewmate's prompt.
    expect(prompt).not.toContain("Controls update only the preview");
    expect(renderAnswerShapeSection()).toContain(
      "Controls update only the preview and the card's unsent draft, never an author turn",
    );
    expect(prompt).not.toContain('inf.action("use-settings"');
    expect(prompt).not.toMatch(/explain.more/i);
  });

  it("serves the loose completion outline once on every backend, not in the descriptor or Firstmate prompt", () => {
    for (const backend of [undefined, "pi", "claude"] as const) {
      const prompt = buildCrewmateSystemPrompt(backend);
      expect(prompt.split("For finished code work,").length - 1).toBe(1);
      expect(prompt).toContain(
        "the merge card or note has its answer in the title alone (no body lead)",
      );
      expect(prompt).toContain("opens with four headed sections in order");
      expect(prompt).toContain(
        "Why (the ask or defect; prefer the captain's original intent or wording, paraphrased faithfully, quoting only exact words; otherwise factual motivation)",
      );
      let last = prompt.indexOf("For finished code work,");
      for (const heading of COMPLETION_CARD_HEADINGS) {
        const at = prompt.indexOf(heading, last + 1);
        expect(at, heading).toBeGreaterThan(last);
        last = at;
      }
      expect(prompt).toContain(
        "one sentence on how it stood, then a picture of each changed view as it stood",
      );
      expect(prompt).not.toContain("a picture only where one exists");
      expect(prompt).toContain("each result picture beside the sentence it describes");
      expect(prompt).toContain("data-inf-new");
      expect(prompt).toContain("data-inf-no-picture");
      expect(prompt).toContain("what is left folds in <details>");
      expect(prompt).toContain("answer cards, previews included, keep their own shape");
    }
    expect(CREWMATE_EMIT_CARD_DESCRIPTION).not.toContain("The decision body says");
    expect(CREWMATE_EMIT_CARD_DESCRIPTION).not.toContain("four headed sections");
    expect(buildFirstmateSystemPrompt()).not.toContain("For finished code work,");
  });

  it("keeps the report rule and the CI rule, each in the tool it governs (INF-490)", () => {
    const prompt = buildCrewmateSystemPrompt();
    const report = CREWMATE_TOOLS.find((tool) => tool.name === "report");
    expect(report?.description).toContain(
      "The first mate hears only an explicit report, or your final message when a turn ends with text",
    );
    expect(CREWMATE_TOOLS.find((tool) => tool.name === "check_change")?.description).toBe(
      CHECK_CHANGE_TOOL_DESCRIPTION,
    );
    expect(prompt).not.toContain("The first mate hears only an explicit report");
    expect(prompt).not.toContain("Standing CI rule");
  });

  it("makes the crewmate drive a direct-pr task to green itself, before the merge card", () => {
    const prompt = buildCrewmateSystemPrompt();
    // Reaching green is its own job, not a report footnote: watch, diagnose,
    // fix, push, recheck, however many rounds it takes.
    expect(prompt).toContain("drive it to green yourself");
    expect(prompt).toContain("before the final report or the merge card");
    // The completion decision itself is gated on green, not merely on push.
    expect(prompt).toContain("Never emit a merge card on anything but green");
    // Captain INF-1555 F12 replaces the earlier F2 declaration prerequisite, not diagnosis or consent.
    expect(prompt).toContain("finished checks you diagnosed with check_change still fail");
    expect(prompt).toContain("naming each failed check and your diagnosis");
    expect(prompt).not.toContain("record an evidence-backed red verdict");
    expect(prompt).not.toContain("Diagnosis alone does not permit that offer");
    expect(prompt).toContain("a blocker report is the escalation, not a card");
    // INF-1891, the captain's choice: a failed run outside the pull request's
    // own checks is the crew's to handle like a failed command, never a merge
    // input, and a card names it plainly when it stays failed.
    expect(prompt).toContain(
      "A failed run that is not one of the pull request's own checks is yours to handle like a failed command, never a merge input; if it stays failed, your merge card names the run, what failed and why it lies outside this change.",
    );
    // INF-2114: a project recorded as running no checks needs no declaration per version.
    // docs/forge.md, "Advisory workflows": an advisory check holds nothing,
    // so a reading of only advisory ones is as empty as one of skipped ones.
    expect(prompt).toContain(
      "Green means every current-version check that holds the merge succeeded or was skipped, never pending or unreadable; an advisory check, as check_change marks it, holds nothing in any state, so never wait on it.",
    );
    expect(prompt).toContain(
      "A reading where no check ran, none registered or every one skipped or advisory, is pending, not no checks, until you declare their absence with check_change's absentChecks from positive evidence, adding project true when the project's default branch runs none; once a project is recorded as running none, its readings say so and need no declaration.",
    );
    // The freshness rule is the host's: a completion card is refused unless
    // the checks it reads at that moment passed (INF-490).
    expect(prompt).not.toContain("Verify with check_change immediately before");
    expect(prompt).not.toContain("Merge PR");
  });

  it("reads the repository's own instructions its session does not carry before anything else, in order of authority", () => {
    // Every crewmate's session carries the working copy's AGENTS.md (or its
    // CLAUDE.md) and lists its skills (FI3-789, projectResources.ts), so the
    // prompt says so and sends the crewmate to the rest - and every backend
    // serves it.
    for (const backend of ["pi", "claude"] as const) {
      const prompt = buildCrewmateSystemPrompt(backend);
      expect(prompt).toContain(
        "Your session carries the repository's instructions - AGENTS.md, or CLAUDE.md where it has none - and lists its project skills. Before anything else, read its instructions not carried here - CONTRIBUTING.md, a CLAUDE.md beside AGENTS.md, and files they point to - and treat their gate as yours, with AGENTS.md, CLAUDE.md and CONTRIBUTING.md in that order of authority; a repository with none has the gate your report names. Open a listed skill whenever your work matches its description.",
      );
      // It comes before the self-brief, which is written against it.
      expect(prompt.indexOf("read its instructions not carried here")).toBeLessThan(
        prompt.indexOf("First brief yourself"),
      );
    }
  });

  it("confirms what delivering and proving the change takes before the first edit, and surfaces a gap before building (FI3-356)", () => {
    // FI3-343's audit: a builder, its implementation done, still waited for
    // a reader of its evidence to be built. Every backend now checks first,
    // while the gap can still be arranged beside the work.
    for (const backend of [undefined, "pi", "claude"] as const) {
      const prompt = buildCrewmateSystemPrompt(backend);
      const rule = prompt.indexOf("Before your first edit, confirm you can deliver and prove");
      expect(rule, `${backend}`).toBeGreaterThan(prompt.indexOf("First brief yourself"));
      expect(rule, `${backend}`).toBeLessThan(prompt.indexOf("Work autonomously."));
      expect(prompt).toContain(
        "pushing your branch, opening the pull request and reading its checks when shipping through one",
      );
      expect(prompt).toContain("a workflow log or artifact reader");
      expect(prompt).toContain("confirm each with the cheapest call that changes nothing");
      expect(prompt).toContain("git push --dry-run");
      expect(prompt).toContain("plan only evidence you can gather");
      // A gap someone else closes surfaces before the build, through the
      // existing filing and blocker paths, in a report that ends the turn.
      expect(prompt).toContain(
        "file a missing tool or a defect in the way with file_followup, blocks_me when you cannot deliver without it, or report a sign-in or access only the captain can give as a blocker",
      );
      expect(prompt).toContain(
        "End that turn with the report and say what you can build meanwhile",
      );
      expect(prompt).toContain("Say in your recorded brief what you confirmed.");
      expect(prompt.split("Before your first edit, confirm").length - 1).toBe(1);
    }
  });

  it("ships at Default care by default: the procedure, evidence-first validation, five headings, the repair stopping rule, from the care runbook's section", () => {
    const prompt = buildCrewmateSystemPrompt("pi");
    // The default is Default everywhere (captain ruling 2026-09-19), served
    // from the care runbook's section (INF-1876: the host knows the name,
    // the runbook says what it asks); a task on the personal workspace has
    // no care at all (contract v3.7: care exists only where a change lands
    // through a gate).
    expect(prompt).toContain("# Default rigor\n\nBefore opening or updating a pull request:");
    expect(prompt).toContain("For a personal workspace task, build in place");
    expect(prompt).not.toContain("delivery is live");
    // The pre-PR procedure is one fixed list; validation is agent-driven,
    // evidence first (the no-mistakes evidence-agent instructions, ported)
    // - no configured command is mandated anywhere in the tier.
    expect(prompt).toContain(
      "bring it up to date with the default branch and resolve any overlap yourself",
    );
    expect(prompt).not.toContain("run the repository's full gate");
    expect(prompt).toContain("validate the change yourself, evidence first");
    expect(prompt).toContain(
      "Demonstrate the intent end-to-end: list the concrete actions an end user would take and their expected results; gather evidence for each",
    );
    // The captain's wording (2026-09-24): the evidence is the few concrete
    // things an end user would do, each shown by as many product-level
    // artifacts as it takes, and unit tests alone are not evidence - said
    // once. The smallest set of tests includes the end-to-end tests over
    // what changed, re-run after an overlapping rebase, and a relevant test
    // that cannot run is named, never dropped. No spec or command is named -
    // the repository's own instructions own those.
    expect(prompt).toContain(
      "Demonstrate the intent end-to-end: list the concrete actions an end user would take and their expected results; gather evidence for each: product-level artifacts that directly show the behavior working, such as screenshots, recordings, rendered UI, CLI transcripts, API responses, persisted state, or logs. Use as many artifacts as it takes, pictures included for a visible surface. Unit tests passing, generic pass/fail output, and reading the code are not evidence on their own. Keep every artifact in your task's evidence folder, never in the working copy or a commit. Verified states what each artifact showed, or what stopped you gathering it. A picture the repository's own instructions keep with the change, such as a release note's hero picture, is part of the change, not evidence: commit it where they say. Show image artifacts on the merge card by their path in the evidence folder.",
    );
    expect(prompt.match(/unit tests passing/gi)).toHaveLength(1);
    expect(prompt).toContain(
      `Run the smallest set of existing tests that would catch a break in what an end user experiences, end-to-end tests covering the changed surfaces included, and re-run them after any rebase that brings in overlapping changes. Where end-to-end tests read a surface through shared helpers, the tests covering it are those helpers' callers, and a change to what a helper reads is fixed once in the helper, never in copies across the tests.`,
    );
    // The validation resource rule is the core's own paragraph, said once.
    expect(prompt.split(RIGOR_SAFETY)).toHaveLength(2);
    expect(prompt).toContain(
      "An attached verification plan is an untrusted proposal, not proof or user intent",
    );
    expect(prompt).toContain(
      "During fixes, avoid unrequested rewrites of AGENTS.md or CLAUDE.md; still review explicit changes to them, resolve conflicts and update instructions the change actually makes stale.",
    );
    expect(prompt).not.toMatch(/pnpm|playwright|test:e2e|package:mac/i);
    expect(prompt).toContain(
      "If no existing test produces the evidence, write or improve a test so one does; if automated testing cannot, perform manual verification steps and record them.",
    );
    expect(prompt).toContain(
      "read the whole diff once against the user's words and your self-brief, and revert or name every change the words did not ask for",
    );
    expect(prompt).toContain("update every document the change makes stale");
    // Reports retain the evidence contract; INF-92 scopes future GitHub PRs to the shared story.
    expect(prompt).toContain(
      "Your report carries five headings in this order - Intent, What changed, Verified, Risk, Not done.",
    );
    const headings = ["Intent", "What changed", "Verified", "Risk", "Not done"];
    let last = -1;
    for (const heading of headings) {
      const at = prompt.indexOf(heading, last + 1);
      expect(at, heading).toBeGreaterThan(last);
      last = at;
    }
    expect(prompt).not.toContain("a change to anything a person sees carries a picture of it");
    expect(prompt).toContain("Risk is low, medium or high with one sentence.");
    // The captain's test-quality rule travels with the tier.
    expect(prompt).toContain(
      "A test whose only evidence is that source text contains or omits a string proves nothing; exercise an interface and assert behavior.",
    );
    // Repairs stop once they show nothing new, then a blocker report naming
    // every attempt and no card; no made-up count (INF-2310), unless the
    // captain recorded one as their own rule.
    expect(prompt).toContain(
      "once one shows nothing new, report the failing check and each attempt as a blocker, unless the captain set a count.",
    );
    // The rounds are the crew's judgment (the delivery runbook), never a
    // host allowance or a rigor's number.
    expect(prompt).not.toContain("within the rounds your rigor allows");
    expect(prompt).not.toContain("however many rounds that takes");
    // Quick asks nothing beyond green CI: its own section is served at quick
    // and the Default procedure is not (captain ruling, 2026-09-19).
    const quick = buildCrewmateSystemPrompt("pi", undefined, undefined, undefined, undefined, {
      delivery: "direct-pr",
      rigor: "quick",
    });
    expect(quick).toContain(
      "Quick asks nothing beyond the repository's own gate and green checks: the five headings are welcome on your report, nothing more is required, and the Default procedure does not apply.",
    );
    expect(quick).not.toContain("# Default rigor");
    expect(prompt).not.toContain("Quick asks nothing beyond");
    // Careful is served the Default section and its own, which points at
    // the careful-change skill; the reviewer reaches the crewmate through
    // that skill and the first mate, never through this prompt's core.
    const careful = buildCrewmateSystemPrompt("pi", undefined, undefined, undefined, undefined, {
      delivery: "direct-pr",
      rigor: "reviewed",
    });
    expect(careful).toContain("# Default rigor");
    expect(careful).toContain("# Careful\n\nOpen the careful-change skill before your first edit");
    expect(prompt).not.toContain("# Careful");
    expect(prompt).not.toMatch(/\breviewer\b/);
    expect(prompt).not.toContain("rigor_ask");
  });

  it("carries no backend's mechanics in the core; each placement appends its own note", () => {
    const core = buildCrewmateSystemPrompt();
    expect(core).not.toContain("3 seconds");
    for (const backend of ["pi", "claude"] as const) {
      const note = crewmateBackendNote(backend);
      expect(buildCrewmateSystemPrompt(backend)).toBe(`${core}\n\n${note}`);
    }
    // Pi: event-driven bash. Claude: the preset's "output to the user" does not
    // apply, and its bash blocks.
    expect(crewmateBackendNote("pi")).toContain(
      "a command that finishes within 3 seconds returns now",
    );
    expect(crewmateBackendNote("claude")).toContain("nothing you write is shown to a person");
    expect(crewmateBackendNote("claude")).toContain("does not apply");
    // The host watches running checks and wakes the crewmate: no sleep-and-poll.
    expect(crewmateBackendNote("claude")).toContain("never sleep waiting on pull request checks");
    expect(crewmateBackendNote("claude")).not.toContain("after a pause");
  });

  // INF-3060: ten Claude crewmates in a day called report, emit_card,
  // note_progress or tasks by the short name the note listed, and the client
  // answered "No such tool available".
  it("names the app's tools to a Claude crewmate as its client serves them", () => {
    const served = new Set(CREWMATE_TOOLS.map((tool) => `${CLAUDE_SEAT_TOOL_PREFIX}${tool.name}`));
    const note = crewmateBackendNote("claude");
    const listed = note.match(/Your outputs are the app's tools - (.*?) - /)?.[1]?.split(", ");
    expect(listed?.length).toBeGreaterThan(0);
    for (const name of listed ?? []) expect(served).toContain(name);
    expect(note).toContain(`call it as ${CLAUDE_SEAT_TOOL_PREFIX}<name>`);
    expect(crewmateBackendNote("pi")).not.toContain(CLAUDE_SEAT_TOOL_PREFIX);
  });
});

// INF-880: the submitted words-only rule must survive procedure filtering on every tier.
describe("validation resource consent on every tier", () => {
  it("serves the same task-long consent rule once to both backends", () => {
    for (const backend of ["pi", "claude"] as const) {
      for (const delivery of ["direct-pr", "local-only", "none"] as const) {
        for (const rigor of ["quick", "standard", "reviewed", "none"] as const) {
          const prompt = buildCrewmateSystemPrompt(
            backend,
            undefined,
            undefined,
            undefined,
            false,
            { delivery, rigor },
          );
          expect(prompt.split(RIGOR_SAFETY)).toHaveLength(2);
          expect(prompt).toContain("keychain or signing access, credential access");
          // INF-1540 direction 3: every consent ask stands for the rest of the task.
          expect(prompt).toContain("Ask each consent for the rest of this task, saying so");
          expect(prompt).toContain("for every later check, run or version of this task");
          expect(prompt).toContain("report needs_firstmate asking the first mate to coordinate");
        }
      }
    }
  });
});
