import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import {
  conversations,
  messages,
  users,
  students,
  teachers,
  classes,
  subjects,
  classSubjects,
  parentStudents,
  parents,
} from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { verifyToken, generateStreamToken, verifyStreamToken } from '../lib/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { eq, and, or, desc, sql, count, inArray } from 'drizzle-orm';

export const communicationsRouter = Router();

// In-memory set of SSE connections mapped by user ID for instant real-time message delivery
const sseClients = new Map<number, Set<Response>>();

export function broadcastCommunicationEvent(targetUserIds: number[], payload: any) {
  if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
    return;
  }
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  const uniqueTargetIds = Array.from(new Set(targetUserIds));
  for (const uid of uniqueTargetIds) {
    const set = sseClients.get(uid);
    if (set && set.size > 0) {
      set.forEach((res) => {
        try {
          res.write(data);
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        } catch {
          set.delete(res);
        }
      });
    }
  }
}

// Dedicated endpoint to mint a short-lived (60s) dedicated stream token for SSE connection
communicationsRouter.get('/stream-token', requireAuth, (req: AuthRequest, res: Response) => {
  const streamToken = generateStreamToken(req.user!.id);
  res.json({ streamToken });
});

// Real-time Server-Sent Events stream for instant message notification (Strict Dedicated Stream Token Only)
communicationsRouter.get('/stream', async (req: AuthRequest, res: Response) => {
  let streamToken = (req.query.streamToken as string) || '';
  if (!streamToken && req.headers.authorization?.startsWith('Bearer ')) {
    streamToken = req.headers.authorization.split('Bearer ')[1].trim();
  }

  if (!streamToken) {
    return res.status(401).json({ error: 'Unauthorized: Dedicated short-lived stream token required for stream connection.' });
  }

  // 1. STRICT STREAM TOKEN VALIDATION:
  // ONLY accept dedicated short-lived stream token minted via GET /api/communications/stream-token.
  // Standard 7-day JWTs are strictly rejected for SSE streams.
  const streamPayload = verifyStreamToken(streamToken);
  if (!streamPayload || typeof streamPayload.userId !== 'number') {
    return res.status(401).json({
      error: 'Unauthorized: Invalid, expired, or unsupported token type. Standard user tokens cannot be used for streaming. Please acquire a dedicated short-lived stream token from /api/communications/stream-token.',
    });
  }

  const userId = streamPayload.userId;

  // 2. CRITICAL SECURITY RE-CHECK:
  // Re-verify current user state directly in PostgreSQL.
  // Suspended or deleted users must be immediately rejected even if old token is valid.
  const [dbUser] = await db
    .select({
      id: users.id,
      uid: users.uid,
      email: users.email,
      role: users.role,
      status: users.status,
      fullName: users.fullName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!dbUser || dbUser.status === 'suspended') {
    return res.status(401).json({ error: 'Unauthorized: Account is suspended or no longer exists.' });
  }

  // Set SSE response headers with anti-buffering directives
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  // IMMEDIATELY flush headers to TCP socket so client completes handshake without pending stall
  res.flushHeaders();

  if (!sseClients.has(dbUser.id)) {
    sseClients.set(dbUser.id, new Set());
  }
  sseClients.get(dbUser.id)!.add(res);

  // Send SSE reconnect interval, proxy buffer flush padding (2KB), and initial connection ack
  res.write('retry: 2500\n\n');
  res.write(':' + ' '.repeat(2048) + '\n\n');
  res.write(`data: ${JSON.stringify({ type: 'connected', userId: dbUser.id })}\n\n`);
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }

  // Heartbeat ping comment every 15 seconds to prevent cloud proxies from dropping idle stream
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = sseClients.get(dbUser.id);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        sseClients.delete(dbUser.id);
      }
    }
  });
});

// Helper: Check if a teacher teaches a student (either as Class Teacher or Subject Teacher)
async function verifyTeacherStudentRelationship(teacherUserId: number, studentId: number): Promise<boolean> {
  const [t] = await db.select().from(teachers).where(eq(teachers.userId, teacherUserId)).limit(1);
  if (!t) return false;

  const [st] = await db.select({ classId: students.classId }).from(students).where(eq(students.id, studentId)).limit(1);
  if (!st || !st.classId) return false;

  // 1. Is teacher the class teacher for this student's class?
  const [asClassTeacher] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, st.classId), eq(classes.classTeacherId, t.id)))
    .limit(1);
  if (asClassTeacher) return true;

  // 2. Is teacher a subject teacher in this student's class?
  const [asSubjectTeacher] = await db
    .select()
    .from(classSubjects)
    .where(and(eq(classSubjects.classId, st.classId), eq(classSubjects.teacherId, t.id)))
    .limit(1);
  return !!asSubjectTeacher;
}

// Helper: Check if a parent is linked to a student
async function verifyParentStudentRelationship(parentUserId: number, studentId: number): Promise<boolean> {
  const [link] = await db
    .select()
    .from(parentStudents)
    .where(and(eq(parentStudents.parentUserId, parentUserId), eq(parentStudents.studentId, studentId)))
    .limit(1);
  return !!link;
}

// Compatibility endpoints for CommunicationsView (/threads and /threads/:id/messages)
communicationsRouter.get('/threads', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let convWhere;
    if (user.role === 'teacher') {
      convWhere = eq(conversations.teacherUserId, user.id);
    } else if (user.role === 'parent') {
      convWhere = eq(conversations.parentUserId, user.id);
    } else if (user.role === 'super_admin') {
      convWhere = sql`1=1`;
    } else {
      return res.status(403).json({ error: 'Access denied: You are not authorized to view communication threads.' });
    }

    const convList = await db
      .select({
        id: conversations.id,
        studentId: conversations.studentId,
        teacherUserId: conversations.teacherUserId,
        parentUserId: conversations.parentUserId,
        subject: conversations.subject,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .where(convWhere)
      .orderBy(desc(conversations.lastMessageAt));

    const result = await Promise.all(
      convList.map(async (c) => {
        const isTeacher = user.id === c.teacherUserId;
        const otherUserId = isTeacher ? c.parentUserId : c.teacherUserId;
        const [otherUser] = await db
          .select({ id: users.id, fullName: users.fullName, role: users.role })
          .from(users)
          .where(eq(users.id, otherUserId))
          .limit(1);

        const [lastMsg] = await db
          .select({ content: messages.content, createdAt: messages.createdAt })
          .from(messages)
          .where(eq(messages.conversationId, c.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        const [unread] = await db
          .select({ count: count() })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, c.id),
              eq(messages.isRead, false),
              sql`${messages.senderUserId} != ${user.id}`
            )
          );

        return {
          id: c.id,
          otherPartyName: otherUser ? otherUser.fullName : 'School Contact',
          otherPartyRole: otherUser ? (otherUser.role === 'teacher' ? 'Faculty Member' : 'Parent / Guardian') : 'Guardian',
          otherPartyId: otherUserId,
          lastMessage: lastMsg?.content || c.subject,
          lastMessageTime: lastMsg?.createdAt ? new Date(lastMsg.createdAt).toISOString() : (c.lastMessageAt ? new Date(c.lastMessageAt).toISOString() : ''),
          unreadCount: Number(unread?.count || 0),
        };
      })
    );

    res.json(result);
  } catch (error: any) {
    console.error('Fetch threads error:', error);
    res.status(500).json({ error: 'Failed to retrieve threads' });
  }
});

communicationsRouter.get('/threads/:id/messages', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const threadId = parseInt(req.params.id, 10);
    const user = req.user!;

    if (!threadId || isNaN(threadId)) {
      return res.status(400).json({ error: 'Valid thread ID is required' });
    }

    // 1. Verify existence of the conversation thread
    const [conv] = await db
      .select({
        id: conversations.id,
        teacherUserId: conversations.teacherUserId,
        parentUserId: conversations.parentUserId,
        studentId: conversations.studentId,
      })
      .from(conversations)
      .where(eq(conversations.id, threadId))
      .limit(1);

    if (!conv) {
      return res.status(404).json({ error: 'Conversation thread not found' });
    }

    // 2. Strict IDOR Authorization Check:
    // Only the assigned parent, assigned teacher (with active student relationship), or super_admin can access
    if (user.role === 'super_admin') {
      // Allowed per administrative permission model
    } else if (user.role === 'teacher') {
      if (conv.teacherUserId !== user.id) {
        return res.status(403).json({ error: 'Access denied: You are not authorized to access this conversation thread.' });
      }
      const isAuthorizedTeacher = await verifyTeacherStudentRelationship(user.id, conv.studentId);
      if (!isAuthorizedTeacher) {
        return res.status(403).json({ error: 'Access denied: You do not have an active teaching assignment for this student.' });
      }
    } else if (user.role === 'parent') {
      if (conv.parentUserId !== user.id) {
        return res.status(403).json({ error: 'Access denied: You are not authorized to access this conversation thread.' });
      }
      const isAuthorizedParent = await verifyParentStudentRelationship(user.id, conv.studentId);
      if (!isAuthorizedParent) {
        return res.status(403).json({ error: 'Access denied: You do not have a verified guardian relationship for this student.' });
      }
    } else {
      // Students and all other unauthorized roles are denied
      return res.status(403).json({ error: 'Access denied: You are not authorized to view parent-teacher communication threads.' });
    }

    // 3. Auto mark read ONLY after authorization has been validated
    const readNow = new Date();
    const updatedMsgs = await db
      .update(messages)
      .set({ isRead: true, readAt: readNow })
      .where(
        and(
          eq(messages.conversationId, threadId),
          eq(messages.isRead, false),
          sql`${messages.senderUserId} != ${user.id}`,
          eq(messages.isInternalNote, false)
        )
      )
      .returning({ id: messages.id, senderUserId: messages.senderUserId });

    if (updatedMsgs.length > 0) {
      broadcastCommunicationEvent([conv.teacherUserId, conv.parentUserId], {
        type: 'messages_read',
        threadId,
        conversationId: threadId,
        readByUserId: user.id,
        readAt: readNow.toISOString(),
      });
    }

    // 4. Query messages - Filter out internal notes for non-admin users
    const messageConditions = [eq(messages.conversationId, threadId)];
    if (user.role !== 'super_admin') {
      messageConditions.push(eq(messages.isInternalNote, false));
    }

    const msgList = await db
      .select({
        id: messages.id,
        senderId: messages.senderUserId,
        senderName: users.fullName,
        senderRole: users.role,
        content: messages.content,
        createdAt: messages.createdAt,
        isRead: messages.isRead,
        readAt: messages.readAt,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderUserId, users.id))
      .where(and(...messageConditions))
      .orderBy(messages.createdAt);

    const formatted = msgList.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.senderName,
      senderRole: m.senderRole,
      receiverId: m.senderId === user.id ? (user.id === conv.teacherUserId ? conv.parentUserId : conv.teacherUserId) : user.id,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : undefined,
    }));

    res.json(formatted);
  } catch (error: any) {
    console.error('Fetch thread messages error:', error);
    res.status(500).json({ error: 'Failed to fetch thread messages' });
  }
});

// 1. GET /api/communications/unread-count - Badge count
communicationsRouter.get('/unread-count', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role === 'super_admin') {
      const [escalatedCount] = await db
        .select({ count: count() })
        .from(conversations)
        .where(eq(conversations.isEscalated, true));
      const [unreadMsgs] = await db
        .select({ count: count() })
        .from(messages)
        .where(and(eq(messages.isRead, false), sql`${messages.senderUserId} != ${user.id}`));
      return res.json({
        unreadCount: Number(unreadMsgs?.count || 0),
        escalatedCount: Number(escalatedCount?.count || 0),
      });
    }

    // For teacher or parent
    let convWhere;
    if (user.role === 'teacher') {
      convWhere = eq(conversations.teacherUserId, user.id);
    } else if (user.role === 'parent') {
      convWhere = eq(conversations.parentUserId, user.id);
    } else {
      return res.json({ unreadCount: 0 });
    }

    const userConvs = await db.select({ id: conversations.id }).from(conversations).where(convWhere);
    if (userConvs.length === 0) {
      return res.json({ unreadCount: 0 });
    }

    const convIds = userConvs.map((c) => c.id);
    const [unread] = await db
      .select({ count: count() })
      .from(messages)
      .where(
        and(
          inArray(messages.conversationId, convIds),
          eq(messages.isRead, false),
          sql`${messages.senderUserId} != ${user.id}`,
          eq(messages.isInternalNote, false)
        )
      );

    res.json({ unreadCount: Number(unread?.count || 0) });
  } catch (error: any) {
    console.error('Fetch unread count error:', error);
    res.status(500).json({ error: 'Failed to retrieve unread communication count' });
  }
});

// 1b. GET /api/communications/latest-summary - Real-time polling summary with latest incoming message info
communicationsRouter.get('/latest-summary', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let convWhere;
    if (user.role === 'teacher') {
      convWhere = eq(conversations.teacherUserId, user.id);
    } else if (user.role === 'parent') {
      convWhere = eq(conversations.parentUserId, user.id);
    } else if (user.role === 'super_admin') {
      convWhere = sql`1=1`;
    } else {
      return res.json({ unreadCount: 0, latestMessage: null });
    }

    const userConvs = await db.select({ id: conversations.id }).from(conversations).where(convWhere);
    if (userConvs.length === 0) {
      return res.json({ unreadCount: 0, latestMessage: null });
    }

    const convIds = userConvs.map((c) => c.id);

    // Unread count
    const [unread] = await db
      .select({ count: count() })
      .from(messages)
      .where(
        and(
          inArray(messages.conversationId, convIds),
          eq(messages.isRead, false),
          sql`${messages.senderUserId} != ${user.id}`,
          eq(messages.isInternalNote, false)
        )
      );

    // Latest incoming message
    const [latestMsg] = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderUserId: messages.senderUserId,
        content: messages.content,
        createdAt: messages.createdAt,
        isRead: messages.isRead,
        senderName: users.fullName,
        senderRole: users.role,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderUserId, users.id))
      .where(
        and(
          inArray(messages.conversationId, convIds),
          sql`${messages.senderUserId} != ${user.id}`,
          eq(messages.isInternalNote, false)
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);

    let resolvedTeacherName = '';
    if (latestMsg) {
      if (latestMsg.senderRole === 'teacher') {
        resolvedTeacherName = latestMsg.senderName;
      } else {
        const [cRecord] = await db
          .select({ teacherUserId: conversations.teacherUserId })
          .from(conversations)
          .where(eq(conversations.id, latestMsg.conversationId))
          .limit(1);
        if (cRecord) {
          const [tU] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, cRecord.teacherUserId)).limit(1);
          resolvedTeacherName = tU?.fullName || '';
        }
      }
    }

    res.json({
      unreadCount: Number(unread?.count || 0),
      latestMessage: latestMsg
        ? {
            id: latestMsg.id,
            conversationId: latestMsg.conversationId,
            senderId: latestMsg.senderUserId,
            senderName: latestMsg.senderName,
            senderRole: latestMsg.senderRole,
            isFromTeacher: latestMsg.senderRole === 'teacher',
            teacherName: resolvedTeacherName || (latestMsg.senderRole === 'teacher' ? latestMsg.senderName : undefined),
            content: latestMsg.content,
            createdAt: latestMsg.createdAt.toISOString(),
            isRead: latestMsg.isRead,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Fetch latest summary error:', error);
    res.status(500).json({ error: 'Failed to retrieve communications summary' });
  }
});

// 2. GET /api/communications/recipients - Permitted contacts only
communicationsRouter.get('/recipients', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.json({ students: [] });

      // Find all classes assigned to this teacher
      const classTeacherClasses = await db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.classTeacherId, t.id));
      const subjectTeacherClasses = await db
        .select({ id: classSubjects.classId })
        .from(classSubjects)
        .where(eq(classSubjects.teacherId, t.id));

      const classIds = Array.from(
        new Set([...classTeacherClasses.map((c) => c.id), ...subjectTeacherClasses.map((c) => c.id)])
      );

      if (classIds.length === 0) {
        return res.json({ students: [] });
      }

      // Fetch students in these classes
      const studentList = await db
        .select({
          studentId: students.id,
          studentCode: students.studentId,
          studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
          classId: students.classId,
          className: classes.name,
        })
        .from(students)
        .innerJoin(classes, eq(students.classId, classes.id))
        .where(inArray(students.classId, classIds))
        .orderBy(classes.name, students.lastName);

      const studentIds = studentList.map((s) => s.studentId);
      if (studentIds.length === 0) {
        return res.json({ students: [] });
      }

      // Fetch linked parents for these students
      const linkedParents = await db
        .select({
          studentId: parentStudents.studentId,
          parentUserId: parentStudents.parentUserId,
          relationship: parentStudents.relationship,
          parentName: users.fullName,
        })
        .from(parentStudents)
        .innerJoin(users, eq(parentStudents.parentUserId, users.id))
        .where(inArray(parentStudents.studentId, studentIds));

      const parentMap = new Map<number, any[]>();
      for (const p of linkedParents) {
        if (!parentMap.has(p.studentId)) parentMap.set(p.studentId, []);
        parentMap.get(p.studentId)!.push({
          parentUserId: p.parentUserId,
          parentName: p.parentName,
          relationship: p.relationship,
        });
      }

      const result = studentList
        .map((s) => ({
          ...s,
          parents: parentMap.get(s.studentId) || [],
        }))
        .filter((s) => s.parents.length > 0); // Only include students with registered parent accounts

      return res.json({ students: result });
    }

    if (user.role === 'parent') {
      // Find parent's children
      const linked = await db
        .select({
          studentId: parentStudents.studentId,
          studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
          studentCode: students.studentId,
          classId: students.classId,
          className: classes.name,
        })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .innerJoin(classes, eq(students.classId, classes.id))
        .where(eq(parentStudents.parentUserId, user.id));

      if (linked.length === 0) return res.json({ children: [] });

      const childrenWithTeachers = await Promise.all(
        linked.map(async (child) => {
          if (!child.classId) return { ...child, teachers: [] };

          // 1. Class Teacher
          const [classTeacher] = await db
            .select({
              teacherUserId: users.id,
              teacherName: users.fullName,
              role: sql<string>`'Class Teacher'`,
            })
            .from(classes)
            .innerJoin(teachers, eq(classes.classTeacherId, teachers.id))
            .innerJoin(users, eq(teachers.userId, users.id))
            .where(eq(classes.id, child.classId))
            .limit(1);

          // 2. Subject Teachers
          const subjectTeachers = await db
            .select({
              teacherUserId: users.id,
              teacherName: users.fullName,
              role: sql<string>`${subjects.name} || ' Teacher'`,
            })
            .from(classSubjects)
            .innerJoin(teachers, eq(classSubjects.teacherId, teachers.id))
            .innerJoin(users, eq(teachers.userId, users.id))
            .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
            .where(eq(classSubjects.classId, child.classId));

          const teacherList: any[] = [];
          const seen = new Set<number>();
          if (classTeacher) {
            teacherList.push(classTeacher);
            seen.add(classTeacher.teacherUserId);
          }
          for (const st of subjectTeachers) {
            if (!seen.has(st.teacherUserId)) {
              teacherList.push(st);
              seen.add(st.teacherUserId);
            }
          }

          return {
            ...child,
            teachers: teacherList,
          };
        })
      );

      return res.json({ children: childrenWithTeachers });
    }

    if (user.role === 'super_admin') {
      return res.json({ message: 'Admin can oversee all conversations' });
    }

    return res.status(403).json({ error: 'Access denied: You are not authorized to access communication recipients.' });
  } catch (error: any) {
    console.error('Fetch recipients error:', error);
    res.status(500).json({ error: 'Failed to retrieve permitted communication contacts' });
  }
});

// 3. GET /api/communications/conversations - List conversations with strict role isolation
communicationsRouter.get('/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { status, escalatedOnly, search } = req.query;

    const whereClauses: any[] = [];

    if (user.role === 'teacher') {
      whereClauses.push(eq(conversations.teacherUserId, user.id));
    } else if (user.role === 'parent') {
      whereClauses.push(eq(conversations.parentUserId, user.id));
    } else if (user.role === 'student') {
      return res.status(403).json({ error: 'Direct parent-teacher messaging is reserved for parents and faculty.' });
    }

    if (status && typeof status === 'string' && status !== 'all') {
      whereClauses.push(eq(conversations.status, status));
    }

    if (escalatedOnly === 'true') {
      whereClauses.push(eq(conversations.isEscalated, true));
    }

    const query = db
      .select({
        id: conversations.id,
        studentId: conversations.studentId,
        studentCode: students.studentId,
        studentFirstName: students.firstName,
        studentLastName: students.lastName,
        className: classes.name,
        teacherUserId: conversations.teacherUserId,
        parentUserId: conversations.parentUserId,
        subject: conversations.subject,
        category: conversations.category,
        status: conversations.status,
        isEscalated: conversations.isEscalated,
        escalationReason: conversations.escalationReason,
        escalatedAt: conversations.escalatedAt,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .innerJoin(students, eq(conversations.studentId, students.id))
      .leftJoin(classes, eq(students.classId, classes.id));

    if (whereClauses.length > 0) {
      query.where(and(...whereClauses));
    }

    query.orderBy(desc(conversations.lastMessageAt));
    const convList = await query;

    // Fetch participant names and unread counts
    const enriched = await Promise.all(
      convList.map(async (c) => {
        const [teacherUser] = await db
          .select({ fullName: users.fullName, email: users.email })
          .from(users)
          .where(eq(users.id, c.teacherUserId))
          .limit(1);

        const [parentUser] = await db
          .select({ fullName: users.fullName, email: users.email })
          .from(users)
          .where(eq(users.id, c.parentUserId))
          .limit(1);

        const [unread] = await db
          .select({ count: count() })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, c.id),
              eq(messages.isRead, false),
              sql`${messages.senderUserId} != ${user.id}`,
              user.role === 'super_admin' ? sql`1=1` : eq(messages.isInternalNote, false)
            )
          );

        const [lastMsg] = await db
          .select({
            content: messages.content,
            senderUserId: messages.senderUserId,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, c.id),
              user.role === 'super_admin' ? sql`1=1` : eq(messages.isInternalNote, false)
            )
          )
          .orderBy(desc(messages.createdAt))
          .limit(1);

        return {
          ...c,
          studentName: `${c.studentFirstName} ${c.studentLastName}`,
          teacherName: teacherUser?.fullName || 'Faculty',
          parentName: parentUser?.fullName || 'Guardian',
          unreadCount: Number(unread?.count || 0),
          lastMessageSnippet: lastMsg?.content ? lastMsg.content.slice(0, 80) : '',
          lastMessageSenderId: lastMsg?.senderUserId,
        };
      })
    );

    res.json(enriched);
  } catch (error: any) {
    console.error('Fetch conversations error:', error);
    res.status(500).json({ error: 'Failed to retrieve conversations' });
  }
});

// 4. GET /api/communications/conversations/:id - Full thread & auto-mark read
communicationsRouter.get('/conversations/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const convId = parseInt(req.params.id);
    const user = req.user!;

    const [conv] = await db
      .select({
        id: conversations.id,
        studentId: conversations.studentId,
        studentCode: students.studentId,
        studentFirstName: students.firstName,
        studentLastName: students.lastName,
        className: classes.name,
        teacherUserId: conversations.teacherUserId,
        parentUserId: conversations.parentUserId,
        subject: conversations.subject,
        category: conversations.category,
        status: conversations.status,
        isEscalated: conversations.isEscalated,
        escalationReason: conversations.escalationReason,
        escalatedAt: conversations.escalatedAt,
        escalatedBy: conversations.escalatedBy,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .innerJoin(students, eq(conversations.studentId, students.id))
      .leftJoin(classes, eq(students.classId, classes.id))
      .where(eq(conversations.id, convId))
      .limit(1);

    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // STRICT ACCESS CONTROL: Must be teacher (assigned), parent (linked), or super_admin
    if (user.role === 'teacher') {
      if (conv.teacherUserId !== user.id) {
        return res.status(403).json({ error: 'Access denied: You are not a participant in this conversation.' });
      }
      const isAuthorizedTeacher = await verifyTeacherStudentRelationship(user.id, conv.studentId);
      if (!isAuthorizedTeacher) {
        return res.status(403).json({ error: 'Access denied: You do not have an active teaching assignment for this student.' });
      }
    } else if (user.role === 'parent') {
      if (conv.parentUserId !== user.id) {
        return res.status(403).json({ error: 'Access denied: You cannot view conversations regarding other children.' });
      }
      const isAuthorizedParent = await verifyParentStudentRelationship(user.id, conv.studentId);
      if (!isAuthorizedParent) {
        return res.status(403).json({ error: 'Access denied: You do not have a verified guardian relationship for this student.' });
      }
    } else if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: You are not authorized to view parent-teacher communication threads.' });
    }

    // Participant user profiles (no phone/private email exposed to frontend by default)
    const [teacherUser] = await db
      .select({ id: users.id, fullName: users.fullName, role: users.role })
      .from(users)
      .where(eq(users.id, conv.teacherUserId))
      .limit(1);

    const [parentUser] = await db
      .select({ id: users.id, fullName: users.fullName, role: users.role })
      .from(users)
      .where(eq(users.id, conv.parentUserId))
      .limit(1);

    let escalatedByUser = null;
    if (conv.escalatedBy) {
      [escalatedByUser] = await db
        .select({ id: users.id, fullName: users.fullName, role: users.role })
        .from(users)
        .where(eq(users.id, conv.escalatedBy))
        .limit(1);
    }

    // Fetch messages in thread (Internal notes visible only to super_admin)
    const msgList = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderUserId: messages.senderUserId,
        senderName: users.fullName,
        senderRole: users.role,
        content: messages.content,
        isRead: messages.isRead,
        readAt: messages.readAt,
        isInternalNote: messages.isInternalNote,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderUserId, users.id))
      .where(
        and(
          eq(messages.conversationId, convId),
          user.role === 'super_admin' ? sql`1=1` : eq(messages.isInternalNote, false)
        )
      )
      .orderBy(messages.createdAt);

    // Auto mark incoming messages as read for this user (internal notes only marked read by super admins)
    await db
      .update(messages)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(messages.conversationId, convId),
          eq(messages.isRead, false),
          sql`${messages.senderUserId} != ${user.id}`,
          user.role === 'super_admin' ? sql`1=1` : eq(messages.isInternalNote, false)
        )
      );

    res.json({
      ...conv,
      studentName: `${conv.studentFirstName} ${conv.studentLastName}`,
      teacher: teacherUser,
      parent: parentUser,
      escalatedByUser,
      messages: msgList,
    });
  } catch (error: any) {
    console.error('Fetch conversation detail error:', error);
    res.status(500).json({ error: 'Failed to retrieve conversation thread' });
  }
});

// 5. POST /api/communications/conversations - Start a new thread with strict validation
communicationsRouter.post('/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { studentId, recipientUserId, subject, category, message } = req.body;

    if (!studentId || !recipientUserId || !subject || !message) {
      return res.status(400).json({
        error: 'Student, recipient, subject, and message content are required.',
      });
    }

    const parsedStudentId = parseInt(studentId);
    const parsedRecipientUserId = parseInt(recipientUserId);

    let teacherUserId: number;
    let parentUserId: number;

    if (user.role === 'teacher') {
      teacherUserId = user.id;
      parentUserId = parsedRecipientUserId;

      // 1. Verify this teacher teaches this student
      const isAssigned = await verifyTeacherStudentRelationship(teacherUserId, parsedStudentId);
      if (!isAssigned) {
        return res.status(403).json({
          error: 'Access denied: You are not assigned to teach this student or their class cohort.',
        });
      }

      // 2. Verify recipient is a registered parent of this student
      const isParentOfStudent = await verifyParentStudentRelationship(parentUserId, parsedStudentId);
      if (!isParentOfStudent) {
        return res.status(403).json({
          error: 'Access denied: The selected user is not a verified parent/guardian of this student.',
        });
      }
    } else if (user.role === 'parent') {
      parentUserId = user.id;
      teacherUserId = parsedRecipientUserId;

      // 1. Verify this parent is linked to this student
      const isParentOfStudent = await verifyParentStudentRelationship(parentUserId, parsedStudentId);
      if (!isParentOfStudent) {
        return res.status(403).json({
          error: 'Access denied: You are only permitted to message teachers regarding your own child.',
        });
      }

      // 2. Verify recipient teacher teaches this student
      const isAssigned = await verifyTeacherStudentRelationship(teacherUserId, parsedStudentId);
      if (!isAssigned) {
        return res.status(403).json({
          error: 'Access denied: The selected teacher is not assigned to your child\'s class or subjects.',
        });
      }
    } else if (user.role === 'super_admin') {
      // Admin initiating
      const [recipientUser] = await db.select().from(users).where(eq(users.id, parsedRecipientUserId)).limit(1);
      if (!recipientUser) return res.status(404).json({ error: 'Recipient not found' });
      if (recipientUser.role === 'parent') {
        parentUserId = recipientUser.id;
        teacherUserId = user.id; // Admin acting on behalf of staff
      } else {
        teacherUserId = recipientUser.id;
        parentUserId = user.id;
      }
    } else {
      return res.status(403).json({ error: 'Access denied: Students cannot initiate direct parent-teacher communications.' });
    }

    const [createdConv] = await db
      .insert(conversations)
      .values({
        studentId: parsedStudentId,
        teacherUserId,
        parentUserId,
        subject: subject.trim(),
        category: category || 'academic',
        status: 'active',
        isEscalated: false,
        lastMessageAt: new Date(),
      })
      .returning();

    const [firstMsg] = await db
      .insert(messages)
      .values({
        conversationId: createdConv.id,
        senderUserId: user.id,
        content: message.trim(),
        isRead: false,
      })
      .returning();

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'COMMUNICATION_STARTED',
      resource: 'conversations',
      resourceId: createdConv.id.toString(),
      details: {
        studentId: parsedStudentId,
        teacherUserId,
        parentUserId,
        subject: subject.trim(),
        category,
      },
      ipAddress: req.ip,
    });

    // Look up teacher name accurately
    const [tUser] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, teacherUserId))
      .limit(1);
    const resolvedTeacherName = tUser?.fullName || (user.role === 'teacher' ? user.fullName : 'Teacher');

    broadcastCommunicationEvent([teacherUserId, parentUserId, user.id], {
      type: 'new_message',
      threadId: createdConv.id,
      conversationId: createdConv.id,
      teacherUserId,
      parentUserId,
      message: {
        id: firstMsg.id,
        conversationId: createdConv.id,
        senderId: user.id,
        senderName: user.fullName,
        senderRole: user.role,
        receiverId: parsedRecipientUserId,
        content: firstMsg.content,
        createdAt: firstMsg.createdAt.toISOString(),
      },
      teacherName: resolvedTeacherName,
      senderName: user.fullName,
      senderRole: user.role,
    });

    res.status(201).json({
      conversation: createdConv,
      message: firstMsg,
    });
  } catch (error: any) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to initiate conversation thread' });
  }
});

// 6. POST /api/communications/conversations/:id/messages & POST /api/communications/messages - Reply to thread
const handleSendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const convId = parseInt(req.params.id || req.body.conversationId);
    const user = req.user!;
    const { content, isInternalNote } = req.body;

    if (!convId || isNaN(convId)) {
      return res.status(400).json({ error: 'Valid conversation ID is required.' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty.' });
    }

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // STRICT ACCESS CONTROL
    if (user.role === 'super_admin') {
      // Allowed per administrative model
    } else if (user.role === 'teacher') {
      if (conv.teacherUserId !== user.id) {
        return res.status(403).json({ error: 'Access denied: You are not a participant in this conversation.' });
      }
      const isAuthorizedTeacher = await verifyTeacherStudentRelationship(user.id, conv.studentId);
      if (!isAuthorizedTeacher) {
        return res.status(403).json({ error: 'Access denied: You do not have an active teaching assignment for this student.' });
      }
    } else if (user.role === 'parent') {
      if (conv.parentUserId !== user.id) {
        return res.status(403).json({ error: 'Access denied: You cannot send messages in another parent\'s conversation.' });
      }
      const isAuthorizedParent = await verifyParentStudentRelationship(user.id, conv.studentId);
      if (!isAuthorizedParent) {
        return res.status(403).json({ error: 'Access denied: You do not have a verified guardian relationship for this student.' });
      }
    } else {
      return res.status(403).json({ error: 'Access denied: You are not authorized to send messages in parent-teacher threads.' });
    }

    const now = new Date();
    const [createdMsg] = await db
      .insert(messages)
      .values({
        conversationId: convId,
        senderUserId: user.id,
        content: content.trim(),
        isRead: false,
        isInternalNote: user.role === 'super_admin' && isInternalNote ? true : false,
        createdAt: now,
      })
      .returning();

    // Update conversation lastMessageAt and reopen if closed
    await db
      .update(conversations)
      .set({
        lastMessageAt: now,
        status: conv.status === 'closed' ? 'active' : conv.status,
        updatedAt: now,
      })
      .where(eq(conversations.id, convId));

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'COMMUNICATION_MESSAGE_SENT',
      resource: 'messages',
      resourceId: createdMsg.id.toString(),
      details: { conversationId: convId, length: content.trim().length },
      ipAddress: req.ip,
    });

    // Look up teacher name accurately for notification banner
    const [teacherRecord] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, conv.teacherUserId))
      .limit(1);
    const teacherName = teacherRecord?.fullName || (user.role === 'teacher' ? user.fullName : 'Teacher');

    // Broadcast real-time message event (Internal notes NEVER reach teachers or parents)
    if (createdMsg.isInternalNote) {
      const superAdminUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'super_admin'));
      const adminTargetIds = Array.from(new Set([user.id, ...superAdminUsers.map((u) => u.id)]));
      
      broadcastCommunicationEvent(adminTargetIds, {
        type: 'new_message',
        threadId: convId,
        conversationId: convId,
        teacherUserId: conv.teacherUserId,
        parentUserId: conv.parentUserId,
        message: {
          id: createdMsg.id,
          conversationId: convId,
          senderId: user.id,
          senderName: user.fullName,
          senderRole: user.role,
          isInternalNote: true,
          content: createdMsg.content,
          createdAt: createdMsg.createdAt ? new Date(createdMsg.createdAt).toISOString() : now.toISOString(),
        },
        teacherName,
        senderName: user.fullName,
        senderRole: user.role,
      });
    } else {
      broadcastCommunicationEvent([conv.teacherUserId, conv.parentUserId, user.id], {
        type: 'new_message',
        threadId: convId,
        conversationId: convId,
        teacherUserId: conv.teacherUserId,
        parentUserId: conv.parentUserId,
        message: {
          id: createdMsg.id,
          conversationId: convId,
          senderId: user.id,
          senderName: user.fullName,
          senderRole: user.role,
          isInternalNote: false,
          receiverId: conv.teacherUserId === user.id ? conv.parentUserId : conv.teacherUserId,
          content: createdMsg.content,
          createdAt: createdMsg.createdAt ? new Date(createdMsg.createdAt).toISOString() : now.toISOString(),
        },
        teacherName,
        senderName: user.fullName,
        senderRole: user.role,
      });
    }

    res.status(201).json({
      id: createdMsg.id,
      senderId: user.id,
      senderName: user.fullName,
      senderRole: user.role,
      receiverId: conv.teacherUserId === user.id ? conv.parentUserId : conv.teacherUserId,
      content: createdMsg.content,
      createdAt: createdMsg.createdAt ? new Date(createdMsg.createdAt).toISOString() : now.toISOString(),
      message: createdMsg,
    });
  } catch (error: any) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

communicationsRouter.post('/conversations/:id/messages', requireAuth, handleSendMessage);
communicationsRouter.post('/threads/:id/messages', requireAuth, handleSendMessage);
communicationsRouter.post('/messages', requireAuth, handleSendMessage);
communicationsRouter.post('/conversations/:id/internal-notes', requireAuth, requireRole(['super_admin']), (req: AuthRequest, res: Response) => {
  req.body.isInternalNote = true;
  return handleSendMessage(req, res);
});

// 7. POST /api/communications/conversations/:id/escalate - Escalate to Admin
communicationsRouter.post('/conversations/:id/escalate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const convId = parseInt(req.params.id);
    const user = req.user!;
    const { reason, category } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Please provide a detailed reason for escalating this matter to Administration.' });
    }

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (user.role === 'teacher' && conv.teacherUserId !== user.id) {
      return res.status(403).json({ error: 'Access denied: You are not a participant in this conversation.' });
    }
    if (user.role === 'parent' && conv.parentUserId !== user.id) {
      return res.status(403).json({ error: 'Access denied: You cannot escalate another parent\'s conversation.' });
    }

    const now = new Date();
    const [updated] = await db
      .update(conversations)
      .set({
        status: 'escalated',
        isEscalated: true,
        escalationReason: reason.trim(),
        category: category || 'safeguarding',
        escalatedAt: now,
        escalatedBy: user.id,
        updatedAt: now,
      })
      .where(eq(conversations.id, convId))
      .returning();

    // Insert automated system notice into message log
    await db.insert(messages).values({
      conversationId: convId,
      senderUserId: user.id,
      content: `[ADMIN ESCALATION NOTICE]: This conversation has been escalated to School Administration for review.\nReason: "${reason.trim()}" (Category: ${category || 'Safeguarding / Disciplinary'})`,
      isRead: false,
      isInternalNote: false,
      createdAt: now,
    });

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'COMMUNICATION_ESCALATED',
      resource: 'conversations',
      resourceId: convId.toString(),
      details: {
        reason: reason.trim(),
        category: category || 'safeguarding',
        escalatedBy: user.id,
      },
      ipAddress: req.ip,
    });

    res.json({
      message: 'Conversation escalated successfully to School Administration.',
      conversation: updated,
    });
  } catch (error: any) {
    console.error('Escalate conversation error:', error);
    res.status(500).json({ error: 'Failed to escalate conversation' });
  }
});

// 8. POST /api/communications/conversations/:id/status - Update conversation status (Close/Reopen)
communicationsRouter.post('/conversations/:id/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const convId = parseInt(req.params.id);
    const user = req.user!;
    const { status } = req.body;

    if (!['active', 'closed', 'resolved', 'escalated'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, closed, resolved, or escalated.' });
    }

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (user.role === 'teacher' && conv.teacherUserId !== user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (user.role === 'parent' && conv.parentUserId !== user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const [updated] = await db
      .update(conversations)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, convId))
      .returning();

    res.json({
      message: `Conversation status updated to ${status}.`,
      conversation: updated,
    });
  } catch (error: any) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update conversation status' });
  }
});

// 9. POST /api/communications/threads/:id/read & POST /api/communications/conversations/:id/read - Mark messages as read with strict IDOR verification
const handleMarkAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const threadId = parseInt(req.params.id, 10);
    const user = req.user!;

    if (!threadId || isNaN(threadId)) {
      return res.status(400).json({ error: 'Valid conversation ID is required' });
    }

    const [conv] = await db
      .select({
        id: conversations.id,
        teacherUserId: conversations.teacherUserId,
        parentUserId: conversations.parentUserId,
        studentId: conversations.studentId,
      })
      .from(conversations)
      .where(eq(conversations.id, threadId))
      .limit(1);

    if (!conv) {
      return res.status(404).json({ error: 'Conversation thread not found' });
    }

    // Strict IDOR Authorization Check
    if (user.role === 'super_admin') {
      // Allowed per administrative model
    } else if (user.role === 'teacher') {
      if (conv.teacherUserId !== user.id) {
        return res.status(403).json({ error: 'Access denied: You are not authorized to access this conversation thread.' });
      }
      const isAuthorizedTeacher = await verifyTeacherStudentRelationship(user.id, conv.studentId);
      if (!isAuthorizedTeacher) {
        return res.status(403).json({ error: 'Access denied: You do not have an active teaching assignment for this student.' });
      }
    } else if (user.role === 'parent') {
      if (conv.parentUserId !== user.id) {
        return res.status(403).json({ error: 'Access denied: You are not authorized to access this conversation thread.' });
      }
      const isAuthorizedParent = await verifyParentStudentRelationship(user.id, conv.studentId);
      if (!isAuthorizedParent) {
        return res.status(403).json({ error: 'Access denied: You do not have a verified guardian relationship for this student.' });
      }
    } else {
      return res.status(403).json({ error: 'Access denied: You are not authorized to access this conversation thread.' });
    }

    const readNow = new Date();
    const updatedMsgs = await db
      .update(messages)
      .set({ isRead: true, readAt: readNow })
      .where(
        and(
          eq(messages.conversationId, threadId),
          eq(messages.isRead, false),
          sql`${messages.senderUserId} != ${user.id}`,
          eq(messages.isInternalNote, false)
        )
      )
      .returning({ id: messages.id });

    if (updatedMsgs.length > 0) {
      broadcastCommunicationEvent([conv.teacherUserId, conv.parentUserId], {
        type: 'messages_read',
        threadId,
        conversationId: threadId,
        readByUserId: user.id,
        readAt: readNow.toISOString(),
      });
    }

    res.json({ success: true, message: 'Messages marked as read', count: updatedMsgs.length });
  } catch (error: any) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

communicationsRouter.post('/threads/:id/read', requireAuth, handleMarkAsRead);
communicationsRouter.post('/conversations/:id/read', requireAuth, handleMarkAsRead);
communicationsRouter.patch('/conversations/:id/read', requireAuth, handleMarkAsRead);

