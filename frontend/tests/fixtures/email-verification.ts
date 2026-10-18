import { user } from "./account";

export const unverifiedUser = { ...user, email_verified: false };
export const verificationLink = `/email/verify/${user.id.toString()}/${"a".repeat(40)}?expires=1790000000&signature=${"b".repeat(64)}`;
export const incorrectEmailUser = {
    ...unverifiedUser,
    email: "typo@example.com",
};
export const correctedEmailUser = {
    ...incorrectEmailUser,
    email: "alex@example.com",
};
