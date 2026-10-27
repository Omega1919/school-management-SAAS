import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { db, runWithSchoolTransaction } from '../db/index.ts';
import { fees, parentStudents, schools, students, users } from '../db/schema.ts';
import { sendLatePaymentReminderEmail } from './email.ts';

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REMINDER_COOLDOWN_MS = 7 * REMINDER_INTERVAL_MS;

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function sendOverdueFeeReminders(): Promise<void> {
  const allSchools = await db.select({ id: schools.id }).from(schools).where(eq(schools.status, 'active'));
  for (const school of allSchools) {
    await runWithSchoolTransaction(school.id, () => sendSchoolOverdueFeeReminders());
  }
}

async function sendSchoolOverdueFeeReminders(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - REMINDER_COOLDOWN_MS);
  const overdueFees = await db
    .select({
      id: fees.id,
      invoiceNumber: fees.invoiceNumber,
      feeTitle: fees.feeTitle,
      balance: fees.outstandingBalance,
      dueDate: fees.dueDate,
      studentId: students.id,
      studentName: students.firstName,
      studentLastName: students.lastName,
      studentUserId: students.userId,
    })
    .from(fees)
    .innerJoin(students, eq(fees.studentId, students.id))
    .where(and(
      lt(fees.dueDate, dateOnly(now)),
      gt(fees.outstandingBalance, '0'),
      or(isNull(fees.lastReminderAt), lt(fees.lastReminderAt, cutoff)),
    ));

  for (const fee of overdueFees) {
    if (!fee.dueDate || !fee.invoiceNumber) continue;
    const recipients: { email: string; name: string }[] = [];
    if (fee.studentUserId) {
      const [studentUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, fee.studentUserId)).limit(1);
      if (studentUser?.email) recipients.push({ email: studentUser.email, name: `${fee.studentName} ${fee.studentLastName}` });
    }
    const guardians = await db
      .select({ email: users.email, fullName: users.fullName })
      .from(parentStudents)
      .innerJoin(users, eq(parentStudents.parentUserId, users.id))
      .where(eq(parentStudents.studentId, fee.studentId));
    for (const guardian of guardians) {
      if (guardian.email) recipients.push({ email: guardian.email, name: guardian.fullName || 'Parent or guardian' });
    }

    let sent = false;
    for (const recipient of [...new Map(recipients.map((item) => [item.email.toLowerCase(), item])).values()]) {
      try {
        await sendLatePaymentReminderEmail({ to: recipient.email, name: recipient.name, invoiceNumber: fee.invoiceNumber, feeTitle: fee.feeTitle, balance: fee.balance, dueDate: fee.dueDate });
        sent = true;
      } catch {
        console.warn('Overdue fee reminder email could not be sent.');
      }
    }
    if (sent) {
      await db.update(fees).set({ lastReminderAt: now }).where(eq(fees.id, fee.id));
    }
  }
}

export function startOverdueFeeReminderSchedule(): void {
  const run = () => sendOverdueFeeReminders().catch(() => console.warn('Overdue fee reminder check failed.'));
  void run();
  const timer = setInterval(run, REMINDER_INTERVAL_MS);
  timer.unref?.();
}
