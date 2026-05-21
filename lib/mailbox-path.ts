/**
 * Maildir path construction — pure and unit-testable (no `server-only`, no env).
 *
 * The stored `mailbox.maildir` value must match what phppostfixadmin writes so
 * a single Postfix/Dovecot config serves mailboxes created by either UI:
 * **relative** `domain/localpart/` (see phppostfixadmin
 * `model/MailboxHandler.php`). The maildir base (e.g. `/var/vmail/`) lives only
 * in Postfix `virtual_mailbox_base` / Dovecot `mail_location`, never in the DB.
 *
 * Earlier this project defaulted to an absolute `/virtual/{domain}/{user}/`
 * with `{user}` expanded to the full email — a port infidelity that no single
 * Dovecot `mail_location` could reconcile with phppostfixadmin. Fixed here.
 *
 * Template placeholders:
 *   {domain} → the domain (e.g. example.com)
 *   {local}  → the bare local part (e.g. user)
 *   {user}   → the full address (e.g. user@example.com), for callers that want it
 */

export const DEFAULT_MAILDIR_TEMPLATE = '{domain}/{local}/';

export function buildMaildir(
  localpart: string,
  domainName: string,
  template: string = DEFAULT_MAILDIR_TEMPLATE,
): string {
  const result = template
    .replace(/\{domain\}/g, domainName)
    .replace(/\{user\}/g, `${localpart}@${domainName}`)
    .replace(/\{local\}/g, localpart);
  // Fallback mirrors phppostfixadmin's relative format if the template renders empty.
  return result || `${domainName}/${localpart}/`;
}
