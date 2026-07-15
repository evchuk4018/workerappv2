export const ALLOWED_EMAIL = "erholovachuk@gmail.com";

export function isAllowedEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === ALLOWED_EMAIL;
}
