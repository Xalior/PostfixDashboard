import 'server-only';

import { db } from '@/lib/db';
import { log } from '@/lib/db/schema';

/**
 * Write an audit-trail entry. Mirrors phppostfixadmin's `log` table contract:
 * actions are short underscore-separated strings (`create_mailbox`,
 * `edit_alias`, `delete_domain`, ...) so they can be rendered per-locale
 * later if we add i18n.
 */
export async function audit(
  username: string,
  domain: string,
  action: string,
  data: string,
): Promise<void> {
  await db.insert(log).values({
    timestamp: new Date(),
    username,
    domain,
    action,
    data,
  });
}
