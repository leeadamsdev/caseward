export default {
    api: {
        input: "../backend/openapi.json",
        output: {
            client: "zod",
            target: "app/generated/api/operations.ts",
            mode: "split",
            schemas: false,
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
