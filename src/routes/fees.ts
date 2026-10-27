import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import { fees, payments, students, academicTerms, academicSessions, classes, parentStudents, users, schoolSettings } from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole, hasPermission, requireRoleOrPermission } from '../middleware/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { eq, and, desc, sql, count, inArray, or } from 'drizzle-orm';
import crypto from 'crypto';

export const feesRouter = Router();

/**
 * Shared atomic payment handler with PostgreSQL FOR UPDATE row locking,
 * balance recalculation, concurrency safety, strict role authorization, and audit logging.
 */
async function processFeePayment({
  feeId,
  amount,
  paymentMethod,
  paymentReference,
  paymentDate,
  notes,
  user,
  ipAddress,
}: {
  feeId: number;
  amount: any;
  paymentMethod?: string;
  paymentReference?: string;
  paymentDate?: string;
  notes?: string;
  user: NonNullable<AuthRequest['user']>;
  ipAddress?: string;
}) {
  if (isNaN(feeId) || feeId <= 0) {
    throw new Error('INVALID_FEE_ID');
  }

  const rawAmount = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(rawAmount) || !isFinite(rawAmount) || rawAmount <= 0) {
    throw new Error('INVALID_AMOUNT');
  }

  // Round payment amount to 2 decimal places to avoid floating point issues
  const paymentAmount = Math.round(rawAmount * 100) / 100;
  if (paymentAmount <= 0) {
    throw new Error('INVALID_AMOUNT');
  }

  // Execute atomic transaction with pessimistic FOR UPDATE row lock
  const transactionResult = await db.transaction(async (tx) => {
    // 1. Acquire exclusive FOR UPDATE lock on the target fee row
    const feeRecords = await tx
      .select()
      .from(fees)
      .where(eq(fees.id, feeId))
      .for('update');

    if (feeRecords.length === 0) {
      throw new Error('NOT_FOUND');
    }

    const fee = feeRecords[0];

    // Payments are manually verified in this demo build. Only school staff
    // authorized for fee management may mark an invoice as paid; parents and
    // students can view their balances but cannot self-certify payment.
    const canRecordPayment = user.role === 'super_admin' || hasPermission(user, 'fee_management');
    if (!canRecordPayment) {
      throw new Error('FORBIDDEN');
    }

    // 3. Recalculate authoritative balances under lock
    const totalFeeAmount = parseFloat(fee.amount);
    const currentPaid = parseFloat(fee.amountPaid);
    const currentOutstanding = Math.max(0, Math.round((totalFeeAmount - currentPaid) * 100) / 100);

    if (currentOutstanding <= 0.001) {
      throw new Error('ALREADY_PAID');
    }

    if (paymentAmount > currentOutstanding + 0.001) {
      throw new Error(`EXCEEDS_BALANCE:${currentOutstanding.toFixed(2)}`);
    }

    // 4. Generate unique payment reference & receipt number
    const year = new Date().getFullYear();
    const receiptRand = crypto.randomBytes(4).toString('hex').toUpperCase();
    const receiptNumber = `REC-${year}-${receiptRand}`;
    const reference = (
      paymentReference?.trim() ||
      `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    ).toUpperCase();

    const formattedPaymentAmount = paymentAmount.toFixed(2);

    // 5. Insert verified payment record
    const [newPayment] = await tx
      .insert(payments)
      .values({
        feeId: fee.id,
        studentId: fee.studentId,
        amount: formattedPaymentAmount,
        paymentDate: paymentDate ? paymentDate.trim() : new Date().toISOString().split('T')[0],
        paymentMethod: paymentMethod ? paymentMethod.trim() : 'Bank Transfer',
        paymentReference: reference,
        receiptNumber,
        verifiedBy: user.id,
        status: 'completed',
        notes: notes ? notes.trim() : null,
      })
      .returning();

    // 6. Compute new authoritative balances & payment status
    const newPaidNum = Math.round((currentPaid + paymentAmount) * 100) / 100;
    const newBalanceNum = Math.max(0, Math.round((totalFeeAmount - newPaidNum) * 100) / 100);

    const newPaidFormatted = newPaidNum.toFixed(2);
    const newBalanceFormatted = newBalanceNum.toFixed(2);
    const newStatus = newBalanceNum <= 0.001 ? 'paid' : 'partially_paid';

    // 7. Update fee record
    const [updatedFee] = await tx
      .update(fees)
      .set({
        amountPaid: newPaidFormatted,
        outstandingBalance: newBalanceFormatted,
        paymentStatus: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(fees.id, fee.id))
      .returning();

    return {
      newPayment,
      updatedFee: {
        id: updatedFee.id,
        studentId: updatedFee.studentId,
        amount: updatedFee.amount,
        amountPaid: updatedFee.amountPaid,
        outstandingBalance: updatedFee.outstandingBalance,
        paymentStatus: updatedFee.paymentStatus,
        feeTitle: updatedFee.feeTitle,
        invoiceNumber: updatedFee.invoiceNumber,
      },
      previousBalance: currentOutstanding.toFixed(2),
    };
  });

  // 8. Log comprehensive audit event
  await logAuditEvent({
    userId: user.id,
    userEmail: user.email,
    role: user.role,
    action: 'PAYMENT_RECORDED',
    resource: 'payments',
    resourceId: transactionResult.newPayment.id.toString(),
    details: {
      feeId: transactionResult.updatedFee.id,
      studentId: transactionResult.newPayment.studentId,
      amount: transactionResult.newPayment.amount,
      receiptNumber: transactionResult.newPayment.receiptNumber,
      paymentReference: transactionResult.newPayment.paymentReference,
      paymentMethod: transactionResult.newPayment.paymentMethod,
      previousBalance: transactionResult.previousBalance,
      newBalance: transactionResult.updatedFee.outstandingBalance,
      paymentStatus: transactionResult.updatedFee.paymentStatus,
    },
    ipAddress,
  });

  return transactionResult;
}

// 1. GET /api/fees - View fee bills & invoices (Role-filtered, paginated, categorized)
feesRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let studentId = req.query.studentId ? parseInt(req.query.studentId as string, 10) : undefined;
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string, 10) : undefined;
    const termId = req.query.termId ? parseInt(req.query.termId as string, 10) : undefined;
    const classId = req.query.classId ? parseInt(req.query.classId as string, 10) : undefined;
    const paymentStatus = req.query.paymentStatus as string | undefined;
    const feeCategory = req.query.feeCategory as string | undefined;

    const conditions: any[] = [];
    const isBursaryAdmin = user.role === 'super_admin' || hasPermission(user, 'fee_management');

    if (user.role === 'teacher' && !isBursaryAdmin) {
      return res.status(403).json({
        error: 'Access denied: Fee management is restricted to administrative bursary personnel, students, and parents.',
      });
    } else if (user.role === 'student') {
      const s = await db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.userId, user.id))
        .limit(1);
      if (s.length === 0) return res.status(404).json({ error: 'Student record not found' });
      if (studentId && studentId !== s[0].id) {
        return res.status(403).json({ error: 'Access denied: You cannot view fee records of other students.' });
      }
      studentId = s[0].id;
      conditions.push(eq(fees.studentId, studentId));
    } else if (user.role === 'parent') {
      const linked = await db
        .select({ studentId: parentStudents.studentId })
        .from(parentStudents)
        .where(eq(parentStudents.parentUserId, user.id));
      const allowed = linked.map((l) => l.studentId);
      if (allowed.length === 0) return res.json(req.query.page !== undefined ? { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } : []);
      if (studentId) {
        if (!allowed.includes(studentId)) {
          return res.status(403).json({ error: 'Unauthorized to view fee records for this student' });
        }
        conditions.push(eq(fees.studentId, studentId));
      } else {
        conditions.push(inArray(fees.studentId, allowed));
      }
    } else if (isBursaryAdmin) {
      if (studentId) conditions.push(eq(fees.studentId, studentId));
    } else {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    if (sessionId) conditions.push(eq(fees.sessionId, sessionId));
    if (termId) conditions.push(eq(fees.termId, termId));
    if (classId) conditions.push(eq(students.classId, classId));
    if (paymentStatus && paymentStatus !== 'all') conditions.push(eq(fees.paymentStatus, paymentStatus));
    if (feeCategory && feeCategory !== 'all') conditions.push(eq(fees.feeCategory, feeCategory));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const isPaginated = req.query.page !== undefined || req.query.paginated === 'true';
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const baseQuery = db
      .select({
        id: fees.id,
        invoiceNumber: fees.invoiceNumber,
        studentId: fees.studentId,
        studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
        studentCode: students.studentId,
        className: classes.name,
        sessionId: fees.sessionId,
        sessionName: academicSessions.name,
        termId: fees.termId,
        termName: academicTerms.termName,
        feeTitle: fees.feeTitle,
        feeCategory: fees.feeCategory,
        amount: fees.amount,
        amountPaid: fees.amountPaid,
        outstandingBalance: fees.outstandingBalance,
        paymentStatus: fees.paymentStatus,
        dueDate: fees.dueDate,
        issuedDate: fees.issuedDate,
        notes: fees.notes,
        createdAt: fees.createdAt,
      })
      .from(fees)
      .innerJoin(students, eq(fees.studentId, students.id))
      .leftJoin(classes, eq(students.classId, classes.id))
      .innerJoin(academicTerms, eq(fees.termId, academicTerms.id))
      .leftJoin(academicSessions, eq(fees.sessionId, academicSessions.id))
      .where(whereClause)
      .orderBy(desc(fees.createdAt));

    if (isPaginated) {
      const [totalRes] = await db
        .select({ count: count() })
        .from(fees)
        .innerJoin(students, eq(fees.studentId, students.id))
        .where(whereClause);
      const total = totalRes?.count || 0;
      const list = await baseQuery.limit(limit).offset(offset);
      return res.json({
        data: list,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    const list = await baseQuery;
    res.json(list);
  } catch (error: any) {
    console.error('Fetch fees error:', error);
    res.status(500).json({ error: 'Failed to retrieve fee records' });
  }
});

// 2. GET /api/fees/student/:studentId - Get fee invoices for a specific student with ownership verification
feesRouter.get('/student/:studentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });
    const user = req.user!;

    if (user.role === 'teacher') {
      return res.status(403).json({ error: 'Access denied: Fee management is restricted to bursary staff, students, and parents.' });
    } else if (user.role === 'student') {
      const [s] = await db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.userId, user.id))
        .limit(1);
      if (!s || s.id !== studentId) {
        return res.status(403).json({ error: 'Unauthorized to view these student fee records' });
      }
    } else if (user.role === 'parent') {
      const [linked] = await db
        .select({ id: parentStudents.id })
        .from(parentStudents)
        .where(and(eq(parentStudents.parentUserId, user.id), eq(parentStudents.studentId, studentId)))
        .limit(1);
      if (!linked) {
        return res.status(403).json({ error: 'Unauthorized: This child is not linked to your account' });
      }
    } else if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    const list = await db
      .select({
        id: fees.id,
        invoiceNumber: fees.invoiceNumber,
        studentId: fees.studentId,
        studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
        studentCode: students.studentId,
        className: classes.name,
        sessionId: fees.sessionId,
        sessionName: academicSessions.name,
        termId: fees.termId,
        termName: academicTerms.termName,
        feeTitle: fees.feeTitle,
        feeCategory: fees.feeCategory,
        amount: fees.amount,
        amountPaid: fees.amountPaid,
        outstandingBalance: fees.outstandingBalance,
        paymentStatus: fees.paymentStatus,
        dueDate: fees.dueDate,
        issuedDate: fees.issuedDate,
        notes: fees.notes,
        createdAt: fees.createdAt,
      })
      .from(fees)
      .innerJoin(students, eq(fees.studentId, students.id))
      .leftJoin(classes, eq(students.classId, classes.id))
      .innerJoin(academicTerms, eq(fees.termId, academicTerms.id))
      .leftJoin(academicSessions, eq(fees.sessionId, academicSessions.id))
      .where(eq(fees.studentId, studentId))
      .orderBy(desc(fees.createdAt));

    res.json(list);
  } catch (error: any) {
    console.error('Fetch student fees error:', error);
    res.status(500).json({ error: 'Failed to retrieve fee records' });
  }
});

// 3. GET /api/fees/statistics - Overall and session financial summaries (Super Admin & Delegated Bursary)
feesRouter.get('/statistics', requireAuth, requireRoleOrPermission(['super_admin'], 'fee_management'), async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string, 10) : undefined;
    const termId = req.query.termId ? parseInt(req.query.termId as string, 10) : undefined;

    const conditions = [];
    if (sessionId) conditions.push(eq(fees.sessionId, sessionId));
    if (termId) conditions.push(eq(fees.termId, termId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [stats] = await db
      .select({
        totalInvoices: count(fees.id),
        totalBilled: sql<string>`COALESCE(SUM(${fees.amount}), 0)`,
        totalPaid: sql<string>`COALESCE(SUM(${fees.amountPaid}), 0)`,
        totalOutstanding: sql<string>`COALESCE(SUM(${fees.outstandingBalance}), 0)`,
      })
      .from(fees)
      .where(whereClause);

    const [paidCount] = await db
      .select({ count: count() })
      .from(fees)
      .where(and(whereClause ? whereClause : undefined, eq(fees.paymentStatus, 'paid')));

    const [unpaidCount] = await db
      .select({ count: count() })
      .from(fees)
      .where(and(whereClause ? whereClause : undefined, eq(fees.paymentStatus, 'unpaid')));

    const [partiallyPaidCount] = await db
      .select({ count: count() })
      .from(fees)
      .where(and(whereClause ? whereClause : undefined, eq(fees.paymentStatus, 'partially_paid')));

    res.json({
      totalInvoices: Number(stats?.totalInvoices || 0),
      totalBilled: parseFloat(stats?.totalBilled || '0').toFixed(2),
      totalPaid: parseFloat(stats?.totalPaid || '0').toFixed(2),
      totalOutstanding: parseFloat(stats?.totalOutstanding || '0').toFixed(2),
      paidInvoices: Number(paidCount?.count || 0),
      unpaidInvoices: Number(unpaidCount?.count || 0),
      partiallyPaidInvoices: Number(partiallyPaidCount?.count || 0),
    });
  } catch (error: any) {
    console.error('Fees statistics error:', error);
    res.status(500).json({ error: 'Failed to generate financial statistics' });
  }
});

// 4. GET /api/fees/:id - View single fee record with role ownership verification
feesRouter.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const feeId = parseInt(req.params.id, 10);
    if (isNaN(feeId)) return res.status(400).json({ error: 'Invalid fee ID' });

    const user = req.user!;

    const [feeRecord] = await db
      .select({
        id: fees.id,
        invoiceNumber: fees.invoiceNumber,
        studentId: fees.studentId,
        studentFirstName: students.firstName,
        studentLastName: students.lastName,
        studentCode: students.studentId,
        className: classes.name,
        sessionId: fees.sessionId,
        sessionName: academicSessions.name,
        termId: fees.termId,
        termName: academicTerms.termName,
        feeTitle: fees.feeTitle,
        feeCategory: fees.feeCategory,
        amount: fees.amount,
        amountPaid: fees.amountPaid,
        outstandingBalance: fees.outstandingBalance,
        paymentStatus: fees.paymentStatus,
        dueDate: fees.dueDate,
        issuedDate: fees.issuedDate,
        notes: fees.notes,
        createdAt: fees.createdAt,
      })
      .from(fees)
      .innerJoin(students, eq(fees.studentId, students.id))
      .leftJoin(classes, eq(students.classId, classes.id))
      .leftJoin(academicSessions, eq(fees.sessionId, academicSessions.id))
      .leftJoin(academicTerms, eq(fees.termId, academicTerms.id))
      .where(eq(fees.id, feeId))
      .limit(1);

    if (!feeRecord) {
      return res.status(404).json({ error: 'Fee invoice not found' });
    }

    if (user.role === 'teacher') {
      return res.status(403).json({ error: 'Access denied: Fee management is restricted to administrative bursary personnel, students, and parents.' });
    } else if (user.role === 'student') {
      const [s] = await db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.userId, user.id))
        .limit(1);
      if (!s || s.id !== feeRecord.studentId) {
        return res.status(403).json({ error: 'Access denied: You cannot access fee invoices belonging to other students' });
      }
    } else if (user.role === 'parent') {
      const [linked] = await db
        .select({ id: parentStudents.id })
        .from(parentStudents)
        .where(and(eq(parentStudents.parentUserId, user.id), eq(parentStudents.studentId, feeRecord.studentId)))
        .limit(1);
      if (!linked) {
        return res.status(403).json({ error: 'Access denied: This invoice is not for your linked child' });
      }
    } else if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized role' });
    }

    res.json(feeRecord);
  } catch (error: any) {
    console.error('Fetch fee invoice detail error:', error);
    res.status(500).json({ error: 'Failed to retrieve fee invoice' });
  }
});

// 5. GET /api/fees/:id/invoice - Full detailed invoice view with payment receipt history
feesRouter.get('/:id/invoice', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const feeId = parseInt(req.params.id, 10);
    if (isNaN(feeId)) return res.status(400).json({ error: 'Invalid fee ID' });

    const user = req.user!;

    const feeRecords = await db
      .select({
        id: fees.id,
        invoiceNumber: fees.invoiceNumber,
        studentId: fees.studentId,
        studentFirstName: students.firstName,
        studentLastName: students.lastName,
        studentCode: students.studentId,
        className: classes.name,
        sessionId: fees.sessionId,
        sessionName: academicSessions.name,
        termId: fees.termId,
        termName: academicTerms.termName,
        feeTitle: fees.feeTitle,
        feeCategory: fees.feeCategory,
        amount: fees.amount,
        amountPaid: fees.amountPaid,
        outstandingBalance: fees.outstandingBalance,
        paymentStatus: fees.paymentStatus,
        dueDate: fees.dueDate,
        issuedDate: fees.issuedDate,
        notes: fees.notes,
        createdAt: fees.createdAt,
      })
      .from(fees)
      .innerJoin(students, eq(fees.studentId, students.id))
      .leftJoin(classes, eq(students.classId, classes.id))
      .innerJoin(academicTerms, eq(fees.termId, academicTerms.id))
      .leftJoin(academicSessions, eq(fees.sessionId, academicSessions.id))
      .where(eq(fees.id, feeId))
      .limit(1);

    if (feeRecords.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const fee = feeRecords[0];

    // Authorization check
    if (user.role === 'teacher') {
      return res.status(403).json({ error: 'Access denied: Teachers do not have fee invoice access.' });
    } else if (user.role === 'student') {
      const [s] = await db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.userId, user.id))
        .limit(1);
      if (!s || s.id !== fee.studentId) {
        return res.status(403).json({ error: 'Unauthorized to view this invoice' });
      }
    } else if (user.role === 'parent') {
      const [linked] = await db
        .select({ id: parentStudents.id })
        .from(parentStudents)
        .where(and(eq(parentStudents.parentUserId, user.id), eq(parentStudents.studentId, fee.studentId)))
        .limit(1);
      if (!linked) {
        return res.status(403).json({ error: 'Unauthorized to view invoice for this student' });
      }
    } else if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get payment history for this invoice
    const paymentRecords = await db
      .select({
        id: payments.id,
        amount: payments.amount,
        paymentDate: payments.paymentDate,
        paymentMethod: payments.paymentMethod,
        paymentReference: payments.paymentReference,
        receiptNumber: payments.receiptNumber,
        status: payments.status,
        verifiedByName: users.fullName,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .leftJoin(users, eq(payments.verifiedBy, users.id))
      .where(eq(payments.feeId, feeId))
      .orderBy(desc(payments.createdAt));

    // Get school branding settings
    const [settings] = await db.select().from(schoolSettings).limit(1);

    res.json({
      invoice: fee,
      payments: paymentRecords,
      school: settings || {
        schoolName: 'School Management System',
        motto: 'Excellence in Education',
        currencySymbol: '$',
      },
    });
  } catch (error: any) {
    console.error('Fetch invoice details error:', error);
    res.status(500).json({ error: 'Failed to retrieve invoice details' });
  }
});

// 6. POST /api/fees - Create fee bills / invoices (Batch Atomic Transaction, Super Admin & Delegated Bursary)
feesRouter.post('/', requireAuth, requireRoleOrPermission(['super_admin'], 'fee_management'), async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, classId, termId, sessionId, feeTitle, feeCategory, amount, dueDate, issuedDate, notes } = req.body;
    if (!termId || !feeTitle || amount === undefined || (!studentId && !classId)) {
      return res.status(400).json({ error: 'Term, title, amount, and either studentId or classId are required' });
    }

    const feeAmount = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(feeAmount) || !isFinite(feeAmount) || feeAmount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount is required' });
    }
    const formattedAmount = (Math.round(feeAmount * 100) / 100).toFixed(2);
    const issueDate = issuedDate || new Date().toISOString().split('T')[0];

    // Determine target session ID
    let targetSessionId = sessionId ? parseInt(sessionId, 10) : null;
    if (!targetSessionId) {
      const [term] = await db
        .select({ sessionId: academicTerms.sessionId })
        .from(academicTerms)
        .where(eq(academicTerms.id, parseInt(termId, 10)))
        .limit(1);
      if (term && term.sessionId) targetSessionId = term.sessionId;
    }

    let targetStudentIds: number[] = [];
    if (studentId) {
      targetStudentIds.push(parseInt(studentId, 10));
    } else if (classId) {
      const classStudents = await db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.classId, parseInt(classId, 10)));
      targetStudentIds = classStudents.map((s) => s.id);
    }

    if (targetStudentIds.length === 0) {
      return res.status(400).json({ error: 'No enrolled students found to assign this fee to' });
    }

    const currentYear = new Date().getFullYear();
    const createdRecords = await db.transaction(async (tx) => {
      const records = [];
      for (const sid of targetStudentIds) {
        const randId = crypto.randomBytes(4).toString('hex').toUpperCase();
        const invoiceNumber = `INV-${currentYear}-${randId}`;

        const [f] = await tx
          .insert(fees)
          .values({
            invoiceNumber,
            studentId: sid,
            sessionId: targetSessionId,
            termId: parseInt(termId, 10),
            feeTitle: feeTitle.trim(),
            feeCategory: feeCategory || 'tuition',
            amount: formattedAmount,
            amountPaid: '0.00',
            outstandingBalance: formattedAmount,
            paymentStatus: 'unpaid',
            dueDate: dueDate || null,
            issuedDate: issueDate,
            notes: notes ? notes.trim() : null,
          })
          .returning();
        records.push(f);
      }
      return records;
    });

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'FEES_INVOICED',
      resource: 'fees',
      details: { count: createdRecords.length, feeTitle, amount: formattedAmount },
      ipAddress: req.ip,
    });

    res.status(201).json({ count: createdRecords.length, records: createdRecords });
  } catch (error: any) {
    console.error('Create fee error:', error);
    res.status(500).json({ error: 'Failed to create fee billing' });
  }
});

// 7. POST /api/fees/:id/payments - Record verified payment transaction (Locked FOR UPDATE, Concurrency Safe)
const handleFeePaymentRequest = async (req: AuthRequest, res: Response) => {
  try {
    const feeId = parseInt(req.params.id, 10);
    const { amount, paymentMethod, paymentReference, paymentDate, notes } = req.body;

    const result = await processFeePayment({
      feeId,
      amount,
      paymentMethod,
      paymentReference,
      paymentDate,
      notes,
      user: req.user!,
      ipAddress: req.ip,
    });

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Record payment error:', error);
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Fee invoice record not found' });
    }
    if (error.message === 'INVALID_FEE_ID') {
      return res.status(400).json({ error: 'Invalid fee ID' });
    }
    if (error.message === 'INVALID_AMOUNT') {
      return res.status(400).json({ error: 'Valid positive payment amount is required' });
    }
    if (error.message === 'ALREADY_PAID') {
      return res.status(400).json({ error: 'This invoice is already fully paid' });
    }
    if (error.message?.startsWith('EXCEEDS_BALANCE')) {
      const bal = error.message.split(':')[1];
      return res.status(400).json({ error: `Payment amount exceeds current outstanding balance of ${bal}` });
    }
    if (error.message?.startsWith('FORBIDDEN')) {
      return res.status(403).json({ error: 'Unauthorized to make or record payment for this fee record' });
    }
    res.status(500).json({ error: 'Failed to record payment transaction' });
  }
};

feesRouter.post('/:id/payments', requireAuth, handleFeePaymentRequest);
feesRouter.post('/:id/pay', requireAuth, handleFeePaymentRequest);
feesRouter.put('/:id/pay', requireAuth, handleFeePaymentRequest);

// 8. POST /api/fees/pay - Alternate route for payment recording (Supports { feeId, amount, paymentMethod, ... })
feesRouter.post('/pay', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { feeId, amount, paymentMethod, paymentReference, paymentDate, notes } = req.body;
    const targetFeeId = parseInt(feeId, 10);

    const result = await processFeePayment({
      feeId: targetFeeId,
      amount,
      paymentMethod,
      paymentReference,
      paymentDate,
      notes,
      user: req.user!,
      ipAddress: req.ip,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Pay fee error:', error);
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Fee invoice record not found' });
    }
    if (error.message === 'INVALID_FEE_ID') {
      return res.status(400).json({ error: 'Valid fee ID is required' });
    }
    if (error.message === 'INVALID_AMOUNT') {
      return res.status(400).json({ error: 'Valid positive payment amount is required' });
    }
    if (error.message === 'ALREADY_PAID') {
      return res.status(400).json({ error: 'This invoice is already fully paid' });
    }
    if (error.message?.startsWith('EXCEEDS_BALANCE')) {
      const bal = error.message.split(':')[1];
      return res.status(400).json({ error: `Payment amount exceeds current outstanding balance of ${bal}` });
    }
    if (error.message?.startsWith('FORBIDDEN')) {
      return res.status(403).json({ error: 'Unauthorized to make or record payment for this fee record' });
    }
    res.status(500).json({ error: 'Failed to record payment transaction' });
  }
});

// 9. GET /api/fees/transactions/history - Get payment transaction history (Role-Filtered)
feesRouter.get('/transactions/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const conditions = [];

    if (user.role === 'teacher') {
      return res.status(403).json({ error: 'Access denied: Teachers do not have financial transaction history access.' });
    } else if (user.role === 'student') {
      const [s] = await db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.userId, user.id))
        .limit(1);
      if (!s) return res.json([]);
      conditions.push(eq(payments.studentId, s.id));
    } else if (user.role === 'parent') {
      const linked = await db
        .select({ studentId: parentStudents.studentId })
        .from(parentStudents)
        .where(eq(parentStudents.parentUserId, user.id));
      const studentIds = linked.map((l) => l.studentId);
      if (studentIds.length === 0) return res.json([]);
      conditions.push(inArray(payments.studentId, studentIds));
    } else if (user.role === 'super_admin') {
      if (req.query.studentId) {
        conditions.push(eq(payments.studentId, parseInt(req.query.studentId as string, 10)));
      }
      if (req.query.feeId) {
        conditions.push(eq(payments.feeId, parseInt(req.query.feeId as string, 10)));
      }
    } else {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const txList = await db
      .select({
        id: payments.id,
        feeId: payments.feeId,
        receiptNumber: payments.receiptNumber,
        paymentReference: payments.paymentReference,
        amount: payments.amount,
        paymentDate: payments.paymentDate,
        paymentMethod: payments.paymentMethod,
        status: payments.status,
        studentId: payments.studentId,
        studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
        studentCode: students.studentId,
        feeTitle: fees.feeTitle,
        notes: payments.notes,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(students, eq(payments.studentId, students.id))
      .innerJoin(fees, eq(payments.feeId, fees.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(payments.createdAt))
      .limit(100);

    res.json(txList);
  } catch (error: any) {
    console.error('Fetch transaction history error:', error);
    res.status(500).json({ error: 'Failed to retrieve transaction history' });
  }
});
