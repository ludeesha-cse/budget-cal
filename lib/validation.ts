// Shared between the register API route (the authoritative check — the client can't
// be trusted to enforce anything) and RegisterForm (the same rules, re-run live as
// the user types, so an obviously-invalid value gets flagged before a network round
// trip instead of after one). This file has no server-only dependencies (no Prisma,
// no secrets), so it's safe to import into a 'use client' component — Next bundles
// it into whichever side imports it, client or server, from this one source.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MIN_PASSWORD_LENGTH = 8

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

// "Standard" password policy: a length floor plus a letter and a digit — enough to
// rule out trivially weak passwords ("password", "12345678") without the friction of
// mandatory special characters or a rotating complexity checklist.
export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && /[a-zA-Z]/.test(password) && /[0-9]/.test(password)
}

// The rule (isValidPassword) and its human-readable explanation live together, so a
// future change to the policy can't update one without the other — the server's 400
// response and the client's live field hint read the exact same sentence.
export const PASSWORD_REQUIREMENTS_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include a letter and a number`

export const EMAIL_INVALID_MESSAGE = 'Enter a valid email address'
