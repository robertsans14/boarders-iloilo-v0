import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const propertyIds = new Set(['1', '2', '3', '4', 'wvsu-ladies-boarding-house'])

const requestSchema = z.object({
  property_id: z.string().refine((value) => propertyIds.has(value), 'Choose an existing property.'),
  full_name: z.string().trim().min(1),
  mobile: z.string().regex(/^09\d{9}$/),
  email: z.string().email(),
  preferred_date: z.string().min(1),
  preferred_time: z.string().min(1),
  notes: z.string().nullable(),
  viewing_mode: z.enum(['accompanied', 'unaccompanied', 'proxy']),
  payment_method: z.enum(['GCash', 'Cash']),
  fee: z.number().finite().nonnegative(),
}).superRefine((value, context) => {
  const viewingDate = new Date(`${value.preferred_date}T${value.preferred_time}`)
  if (Number.isNaN(viewingDate.getTime()) || viewingDate <= new Date()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['preferred_date'], message: 'Please choose a future date and time.' })
  }
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized', message: 'Please sign in or create an account to request a viewing' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const validation = requestSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'validation', message: validation.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  const payload = {
    student_id: user.id,
    ...validation.data,
    status: 'Pending' as const,
    decided_by: null,
  }
  const { error } = await supabase.from('viewing_requests').insert(payload)

  if (error) {
    console.error('[v0] Viewing request insert failed', {
      error: { message: error.message, code: error.code, details: error.details, hint: error.hint },
      payload,
    })
    return NextResponse.json({ error: 'insert_failed', message: 'We could not save your request. Please try again.', technical: { message: error.message, code: error.code ?? 'UNKNOWN', details: error.details, hint: error.hint } }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
