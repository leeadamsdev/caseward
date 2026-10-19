export default {
    api: {
        input: "../backend/openapi.json",
        output: {
            client: "zod",
            target: "app/generated/api/operations.ts",
            schemas: {
                path: "app/generated/api/models.ts",
                mode: "single",
                type: "zod",
            },
            override: {
                zod: {
                    version: 4,
                    generateEachHttpStatus: true,
                    generateReusableSchemas: true,
                    generateCompanionTypes: true,
                    exactOptional: true,
                },
            },
        },
    },
};
