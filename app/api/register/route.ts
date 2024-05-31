import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { isValidEmail, isValidPassword, EMAIL_INVALID_MESSAGE, PASSWORD_REQUIREMENTS_MESSAGE } from '@/lib/validation'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, password } = body

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  if (typeof email !== 'string' || !isValidEmail(email)) {
    return NextResponse.json({ error: EMAIL_INVALID_MESSAGE }, { status: 400 })
  }

  if (typeof password !== 'string' || !isValidPassword(password)) {
    return NextResponse.json({ error: PASSWORD_REQUIREMENTS_MESSAGE }, { status: 400 })
  }

  // Case-insensitive email uniqueness (Someone@x.com and someone@x.com are the same
  // account) — normalized once here, so every other place that reads User.email
  // (getCurrentUser, the Credentials provider) sees consistently-cased addresses.
  const normalizedEmail = email.trim().toLowerCase()

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })

  if (existingUser) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    },
  })

  // Never echo the password or its hash back, even on success.
  return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 })
}
