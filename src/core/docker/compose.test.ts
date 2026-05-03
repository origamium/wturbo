import { describe, expect, it } from "vitest"
import type { ComposeConfig } from "../../types/index.js"
import { resolveComposeProjectName } from "./compose"

const empty = (extra: Partial<ComposeConfig> = {}): ComposeConfig => ({
  services: {},
  ...extra,
})

describe("resolveComposeProjectName", () => {
  it("uses explicit `name:` from compose if set", () => {
    const config = empty({ name: "my_explicit" } as ComposeConfig)
    expect(resolveComposeProjectName(config, "/tmp/whatever")).toBe("my_explicit")
  })

  it("preserves underscores (compose-spec keeps [a-z0-9_-])", () => {
    expect(resolveComposeProjectName(empty(), "/tmp/my_proj")).toBe("my_proj")
  })

  it("preserves dashes", () => {
    expect(resolveComposeProjectName(empty(), "/tmp/my-proj")).toBe("my-proj")
  })

  it("strips dots (not replaces them)", () => {
    // matches `docker compose config` empirical output
    expect(resolveComposeProjectName(empty(), "/tmp/wtb-vc-real.hk4L")).toBe(
      "wtb-vc-realhk4l",
    )
  })

  it("strips spaces and other punctuation", () => {
    expect(resolveComposeProjectName(empty(), "/tmp/My Proj!")).toBe("myproj")
  })

  it("lowercases uppercase letters", () => {
    expect(resolveComposeProjectName(empty(), "/tmp/UPPER_DIR")).toBe("upper_dir")
  })

  it("falls back to wtb-project on empty basename", () => {
    expect(resolveComposeProjectName(empty(), "/")).toBe("wtb-project")
  })

  it("falls back to wtb-project when normalization yields empty string", () => {
    expect(resolveComposeProjectName(empty(), "/tmp/!!!")).toBe("wtb-project")
  })

  it("prepends 'wtb' when first char is not letter/digit (underscore)", () => {
    expect(resolveComposeProjectName(empty(), "/tmp/_leading")).toBe("wtb_leading")
  })

  it("prepends 'wtb' when first char is dash", () => {
    expect(resolveComposeProjectName(empty(), "/tmp/-leading")).toBe("wtb-leading")
  })

  it("ignores empty `name:` and falls through to dir basename", () => {
    const config = empty({ name: "" } as ComposeConfig)
    expect(resolveComposeProjectName(config, "/tmp/dir_name")).toBe("dir_name")
  })

  it("ignores non-string `name:` and falls through", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime guard
    const config = empty({ name: 42 as any })
    expect(resolveComposeProjectName(config, "/tmp/dir_name")).toBe("dir_name")
  })

  describe("COMPOSE_PROJECT_NAME env var", () => {
    it("uses COMPOSE_PROJECT_NAME when set and no `name:` field", () => {
      const env = { COMPOSE_PROJECT_NAME: "from_env" }
      expect(resolveComposeProjectName(empty(), "/tmp/dir_name", env)).toBe("from_env")
    })

    it("explicit `name:` field beats COMPOSE_PROJECT_NAME (Compose precedence)", () => {
      const config = empty({ name: "from_yaml" } as ComposeConfig)
      const env = { COMPOSE_PROJECT_NAME: "from_env" }
      expect(resolveComposeProjectName(config, "/tmp/dir_name", env)).toBe("from_yaml")
    })

    it("ignores empty COMPOSE_PROJECT_NAME and falls back to dir basename", () => {
      const env = { COMPOSE_PROJECT_NAME: "" }
      expect(resolveComposeProjectName(empty(), "/tmp/dir_name", env)).toBe("dir_name")
    })

    it("ignores undefined COMPOSE_PROJECT_NAME and falls back to dir basename", () => {
      const env: NodeJS.ProcessEnv = {}
      expect(resolveComposeProjectName(empty(), "/tmp/dir_name", env)).toBe("dir_name")
    })
  })
})
