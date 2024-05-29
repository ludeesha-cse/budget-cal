import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import type {
  Transaction,
  TransactionType,
  PaymentMethod,
} from "@/types/transaction";

// Route Handlers, not a separate backend service: this file *is* the API this app's
// Server Components fetch() from — the Docker Postgres + Prisma plumbing from the
// previous stage now has an HTTP surface in front of it, so callers never talk to
// Prisma directly.

// Explicit, not load-bearing today: POST already reads the request body, which
// happens to make Next.js treat this whole route as dynamic anyway. Declared
// explicitly so GET stays guaranteed-fresh even if POST's implementation changes
// later
export const dynamic = "force-dynamic";

// Maps a Prisma Transaction row (DateTime object, arbitrary-string type/paymentMethod)
// onto this app's Transaction shape (YYYY-MM-DD string date, literal-union type
// fields)
function toTransactionDTO(row: {
  id: string;
  date: Date;
  amount: number;
  type: string;
  description: string;
  paymentMethod: string;
}): Transaction {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    amount: row.amount,
    type: row.type as TransactionType,
    description: row.description,
    paymentMethod: row.paymentMethod as PaymentMethod,
  };
}

export async function GET() {
  const user = await getCurrentUser();

  // The API is a directly reachable HTTP surface, not just something pages navigate
  // to — protecting pages with a redirect (the (protected) layout) doesn't stop an
  // unauthenticated request from hitting this route straight via fetch/curl, so it
  // needs its own check too.
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(transactions.map(toTransactionDTO));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { date, amount, type, description, paymentMethod } = body;
  if (
    typeof date !== "string" ||
    typeof amount !== "number" ||
    typeof type !== "string" ||
    typeof description !== "string" ||
    typeof paymentMethod !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid transaction payload" },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transaction = await prisma.transaction.create({
    data: {
      date: new Date(date),
      amount,
      type,
      description,
      paymentMethod,
      userId: user.id,
    },
  });

  return NextResponse.json(toTransactionDTO(transaction), { status: 201 });
}
