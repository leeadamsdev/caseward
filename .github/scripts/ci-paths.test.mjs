import assert from "node:assert/strict";
import { test } from "node:test";
import { affectedJobs } from "./ci-paths.mjs";

for (const path of [
    "backend/app/Models/User.php",
    "docker/postgres/init.sql",
    "docker/valkey/users.acl",
]) {
    test(`${path} selects backend and integration`, () => {
        assert.deepEqual(affectedJobs([path]), {
            backend: true,
            frontend: false,
            integration: true,
        });
    });
}
for (const path of ["frontend/app/root.tsx", "docker/frontend/entrypoint.sh"]) {
    test(`${path} selects frontend and integration`, () => {
        assert.deepEqual(affectedJobs([path]), {
            backend: false,
            frontend: true,
            integration: true,
        });
    });
}
for (const path of [
    "compose.yaml",
    "compose.e2e.yaml",
    "compose.ci.yaml",
    ".github/workflows/ci.yaml",
    ".github/actions/dependency-cache/action.yaml",
    ".github/scripts/changes.mjs",
    ".editorconfig",
    ".gitattributes",
    ".dockerignore",
    ".gitignore",
]) {
    test(`${path} selects every check`, () => {
        assert.deepEqual(affectedJobs([path]), {
            backend: true,
            frontend: true,
            integration: true,
        });
    });
}
test("unrelated and empty changes do not select application jobs", () => {
    assert.deepEqual(affectedJobs(["LICENSE", "README.md", "docs/setup.md"]), {
        backend: false,
        frontend: false,
        integration: false,
    });
    assert.deepEqual(affectedJobs([]), {
        backend: false,
        frontend: false,
        integration: false,
    });
});
test("combined changes and future Docker services are covered", () => {
    assert.deepEqual(
        affectedJobs(["backend/composer.lock", "frontend/pnpm-lock.yaml"]),
        { backend: true, frontend: true, integration: true },
    );
    assert.deepEqual(affectedJobs(["docker/mailpit/config.json"]), {
        backend: false,
        frontend: false,
        integration: true,
    });
});
