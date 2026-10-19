import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { generate } from "orval";
import { format, resolveConfig } from "prettier";
import config from "../orval.config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = join(root, "app/generated/api");
const temporaryRoot = tmpdir();
const check = process.argv.includes("--check");
const temporary = await mkdtemp(
    join(temporaryRoot, "caseward-api-generation-"),
);
if (!resolve(temporary).startsWith(resolve(temporaryRoot) + sep)) {
    throw new Error("Unsafe artifact cleanup path.");
}
const files = ["models.ts", "operations.ts"];

try {
    await generate(
        {
            ...config.api,
            input: join(root, config.api.input),
            output: {
                ...config.api.output,
                target: join(temporary, "operations.ts"),
                schemas: {
                    ...config.api.output.schemas,
                    path: join(temporary, "models.ts"),
                },
                tsconfig: join(root, "tsconfig.json"),
                packageJson: join(root, "package.json"),
            },
        },
        root,
        { failOnWarnings: true, throwOnError: true },
    );
    await mkdir(destination, { recursive: true });
    for (const file of files) {
        const path = join(destination, file);
        const expected = await format(
            await readFile(join(temporary, file), "utf8"),
            {
                ...(await resolveConfig(path, { editorconfig: true })),
                filepath: path,
            },
        );
        if (check) {
            const actual = await readFile(path, "utf8").catch((error) => {
                if (error.code === "ENOENT") return undefined;
                throw error;
            });
            if (actual !== expected)
                throw new Error(
                    `${file} is outdated. Run pnpm run api:generate.`,
                );
        } else await writeFile(path, expected);
    }
    const unexpected = (await readdir(destination)).filter(
        (file) => !files.includes(file),
    );
    if (unexpected.length)
        throw new Error(`Unexpected generated files: ${unexpected.join(", ")}`);
    process.stdout.write(
        check
            ? "Generated API files are current.\n"
            : "API types and Zod schemas generated.\n",
    );
} finally {
    await rm(temporary, { recursive: true, force: true });
}
