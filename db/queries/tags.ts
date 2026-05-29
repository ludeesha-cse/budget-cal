import { eq } from 'drizzle-orm';
import { db } from '../index';
import {
  tags,
  transactionTags,
} from '../schema';

type Tag = typeof tags.$inferSelect;

// Stage 15: transaction search and tags. Tags are a flat, user-managed
// vocabulary (like categories); transactionTags is their many-to-many
// join to `transactions`. Nothing in this section is ever allowed to
// delete a transaction — see the CRITICAL note on deleteTag below, which
// is the one place that actually matters.

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/tags, keeping the same return type. Alphabetical, not
// createdAt-ordered — a flat tag list is picked from, not read
// chronologically, unlike most other lists in this app.
export async function getTags(): Promise<Tag[]> {
  try {
    return await db.select().from(tags).orderBy(tags.name);
  } catch (error) {
    console.error('getTags: failed to load tags', error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(POST
// /api/tags), keeping the same input/return shape.
export async function addTag(name: string): Promise<Tag> {
  try {
    if (!name.trim()) {
      throw new Error('A name is required for the tag.');
    }
    const [tag] = await db
      .insert(tags)
      .values({ name: name.trim(), createdAt: Date.now() })
      .returning();
    return tag;
  } catch (error) {
    console.error('addTag: failed to add tag', name, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PATCH
// /api/tags/:id), keeping the same input/return shape. Renaming a tag
// changes what every transaction already carrying it displays — there's
// no snapshot-at-time-of-tagging the way a recurring rule's amount is
// snapshotted into its occurrence, since a tag is just a label, not a
// value that could roll forward incorrectly.
export async function updateTag(id: number, name: string): Promise<Tag> {
  try {
    if (!name.trim()) {
      throw new Error('A name is required for the tag.');
    }
    const [updated] = await db
      .update(tags)
      .set({ name: name.trim() })
      .where(eq(tags.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error(`updateTag: failed to update tag id=${id}`, name, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(DELETE
// /api/tags/:id), keeping the same input shape.
//
// CRITICAL: this deletes the tag itself and its transaction_tags rows —
// and NOTHING ELSE. It must never delete, or even touch, anything in
// `transactions`. db/schema.ts deliberately declares transactionTags'
// foreign keys with no ON DELETE CASCADE specifically so a stray FK
// constraint could never take a real financial record down with a tag; this
// function honors that same boundary in application code, only ever
// issuing deletes against `transactionTags` and `tags`. A cascade that
// deleted transactions here would be catastrophic and exactly the kind of
// bug this comment exists to rule out for anyone touching this later.
export async function deleteTag(id: number): Promise<void> {
  try {
    await db.transaction(async tx => {
      await tx.delete(transactionTags).where(eq(transactionTags.tagId, id));
      await tx.delete(tags).where(eq(tags.id, id));
    });
  } catch (error) {
    console.error(`deleteTag: failed to delete tag id=${id}`, error);
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with fetch(PUT
// /api/transactions/:id/tags), keeping the same input shape. Replaces the
// full tag set in one call — delete every existing transaction_tags row
// for this transaction, then insert the new set — rather than computing
// an add/remove delta. Simpler and less error-prone: the caller (a
// multi-select UI) always already knows the full desired set, so there's
// no reason to make this function reconstruct one from a diff. An empty
// tagIds array is valid and just clears every tag from the transaction.
export async function setTransactionTags(
  transactionId: number,
  tagIds: number[],
): Promise<void> {
  try {
    await db.transaction(async tx => {
      await tx
        .delete(transactionTags)
        .where(eq(transactionTags.transactionId, transactionId));
      if (tagIds.length > 0) {
        await tx
          .insert(transactionTags)
          .values(tagIds.map(tagId => ({ transactionId, tagId })));
      }
    });
  } catch (error) {
    console.error(
      `setTransactionTags: failed to set tags for transaction id=${transactionId}`,
      tagIds,
      error,
    );
    throw error;
  }
}

// NETWORK-READY: If a backend is added later, replace this with a fetch()
// call to GET /api/transactions/:id/tags, keeping the same return type.
export async function getTagsForTransaction(
  transactionId: number,
): Promise<Tag[]> {
  try {
    return await db
      .select({
        id: tags.id,
        name: tags.name,
        createdAt: tags.createdAt,
      })
      .from(transactionTags)
      .innerJoin(tags, eq(transactionTags.tagId, tags.id))
      .where(eq(transactionTags.transactionId, transactionId))
      .orderBy(tags.name);
  } catch (error) {
    console.error(
      `getTagsForTransaction: failed to load tags for transaction id=${transactionId}`,
      error,
    );
    throw error;
  }
}

