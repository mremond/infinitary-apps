import { describe, expect, it } from "vitest";
import {
  branchComparePage,
  forgeOf,
  forgePlace,
  hasChangeRequests,
  hostOfAddress,
  kindOfHost,
} from "./forge";
import { changePageUrl } from "./forgeKinds";
import { hostTakesBatches } from "./repos";

describe("forgeOf", () => {
  it("reads a project with no origin as living only on this Mac", () => {
    expect(forgeOf(null)).toEqual({ kind: "none", host: null });
    expect(forgeOf(undefined)).toEqual({ kind: "none", host: null });
    expect(forgeOf("  ")).toEqual({ kind: "none", host: null });
  });

  it("reads every GitHub URL shape the same way", () => {
    const github = { kind: "github", host: "github.com", owner: "o", name: "r" };
    for (const origin of [
      "https://github.com/o/r.git",
      "https://github.com/o/r",
      "https://github.com/o/r/",
      "https://user@github.com/o/r.git",
      "http://www.github.com/o/r.git",
      "ssh://git@github.com/o/r.git",
      "ssh://git@github.com:22/o/r.git",
      "git@github.com:o/r.git",
      "git@GitHub.com:o/r",
      "github.com:o/r.git",
    ]) {
      expect(forgeOf(origin), origin).toEqual(github);
    }
  });

  // Settings reads the address field as it is typed, so an escape half typed
  // must read as no repository rather than stop the page.
  it("reads an address with an unfinished escape as naming no repository", () => {
    for (const draft of ["https://github.com/o/r%", "https://github.com/o/r%2"]) {
      expect(forgeOf(draft), draft).toEqual({ kind: "git", host: null });
    }
    expect(forgeOf("https://github.com/o/r%2E")).toEqual({
      kind: "github",
      host: "github.com",
      owner: "o",
      name: "r.",
    });
  });

  it("names GitLab and Bitbucket by their public hosts, nested groups included", () => {
    expect(forgeOf("https://gitlab.com/group/sub/r.git")).toEqual({
      kind: "gitlab",
      host: "gitlab.com",
      owner: "group/sub",
      name: "r",
    });
    expect(forgeOf("git@bitbucket.org:team/r.git")).toEqual({
      kind: "bitbucket",
      host: "bitbucket.org",
      owner: "team",
      name: "r",
    });
  });

  it("reads any other host as a plain Git host, named", () => {
    expect(forgeOf("https://git.example.com/o/r.git")).toEqual({
      kind: "git",
      host: "git.example.com",
      owner: "o",
      name: "r",
    });
    expect(forgeOf("git@gitlab.example.com:o/r.git")).toMatchObject({
      kind: "git",
      host: "gitlab.example.com",
    });
    expect(forgeOf("https://git.example.com/r.git")).toEqual({
      kind: "git",
      host: "git.example.com",
    });
  });

  it("reads a remote on this Mac's own disk as a plain host with no host name", () => {
    for (const origin of [
      "/Users/me/bare/r.git",
      "./r.git",
      "file:///Users/me/r.git",
      "C:\\repos\\r",
    ]) {
      expect(forgeOf(origin), origin).toEqual({ kind: "git", host: null });
    }
  });
});

describe("a host on the person's own server", () => {
  it("reads a .ghe.com host as GitHub by its name alone", () => {
    expect(forgeOf("https://octo.ghe.com/acme/meter.git")).toEqual({
      kind: "github",
      host: "octo.ghe.com",
      owner: "acme",
      name: "meter",
    });
    expect(forgeOf("git@octo.ghe.com:acme/meter.git").kind).toBe("github");
    // Only a name directly under ghe.com is GitHub's own.
    expect(forgeOf("https://a.b.ghe.com/acme/meter.git").kind).toBe("git");
  });

  it("reads any other host as the kind the caller knows it is, never a public host as another", () => {
    const known = [
      { host: "github.corp.example", kind: "github" as const },
      { host: "github.com", kind: "gitlab" as const },
    ];
    expect(forgeOf("https://github.corp.example/acme/meter.git", known)).toEqual({
      kind: "github",
      host: "github.corp.example",
      owner: "acme",
      name: "meter",
    });
    expect(forgeOf("https://github.corp.example/acme/meter.git").kind).toBe("git");
    expect(forgeOf("https://github.com/acme/meter.git", known).kind).toBe("github");
    expect(kindOfHost("git.corp.example", known)).toBe("git");
  });

  it("names it by its own address, and reads the host from whatever address the person typed", () => {
    expect(forgePlace({ kind: "github", host: "github.corp.example" })).toBe("github.corp.example");
    expect(forgePlace({ kind: "gitlab", host: "git.corp.example" })).toBe("git.corp.example");
    for (const typed of [
      "github.corp.example",
      " GitHub.Corp.Example ",
      "https://github.corp.example/",
      "github.corp.example/acme/meter",
      "github.corp.example:8443",
      "git@github.corp.example:acme/meter.git",
      "ssh://git@github.corp.example/acme/meter.git",
    ]) {
      expect(hostOfAddress(typed), typed).toBe("github.corp.example");
    }
    expect(hostOfAddress("")).toBeNull();
    expect(hostOfAddress("/Users/me/meter")).toBeNull();
  });
});

describe("a Bitbucket Data Center server", () => {
  const known = [{ host: "bitbucket.example.com", kind: "bitbucket" as const }];

  it("links a pull request on the server's own project and repository pages, never Cloud's", () => {
    const https = forgeOf("https://bitbucket.example.com/scm/prj/app.git", known);
    expect(https).toEqual({
      kind: "bitbucket",
      host: "bitbucket.example.com",
      owner: "scm/prj",
      name: "app",
    });
    expect(changePageUrl("bitbucket", "bitbucket.example.com", "scm/prj/app", 7)).toBe(
      "https://bitbucket.example.com/projects/PRJ/repos/app/pull-requests/7",
    );
    expect(changePageUrl("bitbucket", "bitbucket.example.com", "~jane.doe/notes", 2)).toBe(
      "https://bitbucket.example.com/users/jane.doe/repos/notes/pull-requests/2",
    );
    expect(changePageUrl("bitbucket", "bitbucket.org", "team/app", 7)).toBe(
      "https://bitbucket.org/team/app/pull-requests/7",
    );
  });

  it("takes batches, linking a batched change to the server's own compare page", () => {
    const where = {
      kind: "bitbucket" as const,
      owner: "scm/prj",
      name: "app",
      base: "main",
      branch: "inf/fix-dates",
    };
    expect(branchComparePage({ ...where, host: "bitbucket.example.com" })).toBe(
      "https://bitbucket.example.com/projects/PRJ/repos/app/compare/commits?sourceBranch=refs%2Fheads%2Finf%2Ffix-dates&targetBranch=refs%2Fheads%2Fmain",
    );
    expect(branchComparePage({ ...where, host: "bitbucket.org" })).not.toBeNull();
    expect(hostTakesBatches({ kind: "bitbucket", name: "bitbucket.example.com" })).toBe(true);
    expect(hostTakesBatches({ kind: "bitbucket", name: "bitbucket.org" })).toBe(true);
  });
});

describe("forgePlace", () => {
  it("names a public host by its provider and any other host by its address", () => {
    expect(forgePlace(forgeOf("git@github.com:o/app.git"))).toBe("GitHub");
    expect(forgePlace(forgeOf("https://gitlab.com/group/sub/app.git"))).toBe("GitLab");
    expect(forgePlace(forgeOf("https://bitbucket.org/team/app.git"))).toBe("Bitbucket");
    expect(forgePlace(forgeOf("ssh://git@git.example.com:2222/me/app.git"))).toBe(
      "git.example.com",
    );
  });

  it("names nothing for a project kept on this Mac or a remote on its own disk", () => {
    expect(forgePlace(forgeOf(null))).toBeNull();
    expect(forgePlace(forgeOf("/Users/me/backups/app.git"))).toBeNull();
    expect(forgePlace(forgeOf("file:///Users/me/app.git"))).toBeNull();
  });
});

describe("hasChangeRequests", () => {
  it("is GitHub's and Bitbucket's pull requests and GitLab's merge requests, and no other kind", () => {
    expect(
      (["github", "gitlab", "bitbucket", "git", "none", undefined] as const).map((kind) => [
        kind,
        hasChangeRequests(kind),
      ]),
    ).toEqual([
      ["github", true],
      ["gitlab", true],
      ["bitbucket", true],
      ["git", false],
      ["none", false],
      [undefined, false],
    ]);
  });
});
