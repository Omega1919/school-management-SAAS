import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import {
  admissionApplications,
  admissionApplicationLogs,
  academicSessions,
  academicTerms,
  classes,
  departments,
  schoolSettings,
  students,
  studentEnrollments,
  users,
  publicPortalSettings,
} from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole, hasPermission, requireRoleOrPermission } from '../middleware/auth.ts';
import {
  generateUniqueStudentId,
  generateUniqueApplicationNumber,
  generateSecureToken,
  hashToken,
} from '../lib/identifiers.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { admissionsLimiter, applicationTrackLimiter } from '../middleware/rate-limiter.ts';
import { eq, and, or, desc, inArray, count, sql, ilike } from 'drizzle-orm';
import { StorageService } from '../lib/storage.ts';

export const admissionsRouter = Router();

// ============================================================================
// 1. PUBLIC ADMISSION APPLICANT ENDPOINTS (No Login Required)
// ============================================================================

// GET /api/admissions/public/options - Dynamically load academic options for registration form
admissionsRouter.get('/public/options', async (_req, res: Response) => {
  try {
    const [settingsList, activeSessions, activeClasses, activeDepartments, portalSettingsList] = await Promise.all([
      db.select({
        schoolName: schoolSettings.schoolName,
        motto: schoolSettings.motto,
        termSystem: schoolSettings.termSystem,
        levelSystem: schoolSettings.levelSystem,
        contactEmail: schoolSettings.contactEmail,
        contactPhone: schoolSettings.contactPhone,
        address: schoolSettings.address,
      }).from(schoolSettings).limit(1),

      db.select({
        id: academicSessions.id,
        name: academicSessions.name,
        startDate: academicSessions.startDate,
        endDate: academicSessions.endDate,
        isCurrent: academicSessions.isCurrent,
        status: academicSessions.status,
        description: academicSessions.description,
      })
      .from(academicSessions)
      .where(inArray(academicSessions.status, ['active', 'upcoming']))
      .orderBy(desc(academicSessions.isCurrent), desc(academicSessions.startDate)),

      db.select({
        id: classes.id,
        name: classes.name,
        section: classes.section,
        gradeLevel: classes.gradeLevel,
        sessionId: classes.sessionId,
        departmentId: classes.departmentId,
        capacity: classes.capacity,
        status: classes.status,
        isPubliclyVisible: classes.isPubliclyVisible,
        admissionStatus: classes.admissionStatus,
        publicDescription: classes.publicDescription,
        duration: classes.duration,
        requirements: classes.requirements,
        isFeatured: classes.isFeatured,
      })
      .from(classes)
      .where(and(eq(classes.status, 'active'), eq(classes.isPubliclyVisible, true), eq(classes.admissionStatus, 'available')))
      .orderBy(classes.name),

      db.select({
        id: departments.id,
        code: departments.code,
        name: departments.name,
        description: departments.description,
      })
      .from(departments)
      .where(eq(departments.status, 'active'))
      .orderBy(departments.name),

      db.select().from(publicPortalSettings).limit(1),
    ]);

    const settings = settingsList[0] || {
      schoolName: 'School Management System',
      motto: 'Integrated Academic & Administrative Platform',
      termSystem: 'term',
      levelSystem: 'class',
    };

    const portalSetting = portalSettingsList[0] || {
      portalEnabled: true,
      admissionsOpen: true,
      openingDate: null,
      closingDate: null,
      currentSessionId: activeSessions[0]?.id || null,
      announcementMessage: 'Applications are now officially open for admission into accredited programmes.',
      applicationInstructions: 'Complete the form and track your progress with your Application Number & Access Key.',
      applicationFee: '0.00',
      admissionsContactInfo: 'Admissions Office: contact school administration',
    };

    const today = new Date().toISOString().split('T')[0];
    const isAdmissionsActive =
      portalSetting.admissionsOpen &&
      (!portalSetting.openingDate || today >= portalSetting.openingDate) &&
      (!portalSetting.closingDate || today <= portalSetting.closingDate);

    res.json({
      settings,
      portalSettings: {
        ...portalSetting,
        isAdmissionsActive,
      },
      sessions: activeSessions,
      classes: activeClasses,
      departments: activeDepartments,
    });
  } catch (error: any) {
    console.error('Fetch public admission options error:', error);
    res.status(500).json({ error: 'Failed to retrieve admission options' });
  }
});

// POST /api/admissions/public/apply - Public applicant submits application (Rate Limited)
admissionsRouter.post('/public/apply', admissionsLimiter, async (req, res: Response) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      dateOfBirth,
      gender,
      email,
      phone,
      address,
      sessionId,
      classId,
      departmentId,
      guardianName,
      guardianPhone,
      guardianEmail,
      guardianRelationship,
      nationality,
      stateOfOrigin,
      lga,
      passportPhoto,
      guardianAddress,
      guardianOccupation,
      emergencyContactName,
      emergencyContactPhone,
      entryMode,
      documents,
      applicantMessage,
    } = req.body;

    // 0. Server-Side Admissions Window & Master Portal Switch Guard
    const [portalSetting] = await db.select().from(publicPortalSettings).limit(1);
    if (portalSetting) {
      if (!portalSetting.portalEnabled) {
        return res.status(403).json({ error: 'The public admissions portal is currently disabled.' });
      }
      if (!portalSetting.admissionsOpen) {
        return res.status(400).json({ error: 'Admissions are currently closed. New applications cannot be submitted at this time.' });
      }
      const today = new Date().toISOString().split('T')[0];
      if (portalSetting.openingDate && today < portalSetting.openingDate) {
        return res.status(400).json({ error: `Admissions have not opened yet. Applications begin on ${portalSetting.openingDate}.` });
      }
      if (portalSetting.closingDate && today > portalSetting.closingDate) {
        return res.status(400).json({ error: `Admissions deadline has passed. Applications closed on ${portalSetting.closingDate}.` });
      }
    }

    // 1. Mandatory field validation
    if (!firstName || !firstName.trim()) {
      return res.status(400).json({ error: 'First name is required' });
    }
    if (!lastName || !lastName.trim()) {
      return res.status(400).json({ error: 'Last name is required' });
    }
    if (!dateOfBirth || !dateOfBirth.trim()) {
      return res.status(400).json({ error: 'Date of birth is required' });
    }
    if (!gender || !['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ error: 'Gender must be Male, Female, or Other' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Applicant email address is required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!address || !address.trim()) {
      return res.status(400).json({ error: 'Residential address is required' });
    }

    // 2. Validate Academic Session
    const parsedSessionId = parseInt(sessionId, 10);
    if (isNaN(parsedSessionId) || parsedSessionId <= 0) {
      return res.status(400).json({ error: 'A valid academic session must be selected' });
    }
    const [targetSession] = await db
      .select()
      .from(academicSessions)
      .where(and(eq(academicSessions.id, parsedSessionId), inArray(academicSessions.status, ['active', 'upcoming'])))
      .limit(1);
    if (!targetSession) {
      return res.status(400).json({ error: 'Selected academic session is invalid, inactive, or archived' });
    }

    // 3. Validate Class / Level Availability (Server-Side Enforced)
    const parsedClassId = parseInt(classId, 10);
    if (isNaN(parsedClassId) || parsedClassId <= 0) {
      return res.status(400).json({ error: 'A valid class/level must be selected' });
    }
    const [targetClass] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, parsedClassId), eq(classes.status, 'active')))
      .limit(1);
    if (!targetClass) {
      return res.status(400).json({ error: 'Selected class/level does not exist or is not active' });
    }

    if (targetClass.admissionStatus === 'closed') {
      return res.status(400).json({ error: `Admissions for ${targetClass.name} are currently closed.` });
    }
    if (targetClass.admissionStatus === 'hidden' || !targetClass.isPubliclyVisible) {
      return res.status(400).json({ error: `The selected class/program is not available for public admission.` });
    }

    // If class is explicitly bound to a session, ensure it matches
    if (targetClass.sessionId && targetClass.sessionId !== parsedSessionId) {
      return res.status(400).json({ error: 'Selected class does not belong to the selected academic session' });
    }

    // 4. Validate Department if provided
    let parsedDepartmentId: number | null = null;
    if (departmentId !== undefined && departmentId !== null && departmentId !== '') {
      parsedDepartmentId = parseInt(departmentId, 10);
      if (isNaN(parsedDepartmentId) || parsedDepartmentId <= 0) {
        return res.status(400).json({ error: 'Invalid department ID' });
      }
      const [dept] = await db
        .select()
        .from(departments)
        .where(and(eq(departments.id, parsedDepartmentId), eq(departments.status, 'active')))
        .limit(1);
      if (!dept) {
        return res.status(400).json({ error: 'Selected department/programme is invalid or inactive' });
      }
    } else if (targetClass.departmentId) {
      parsedDepartmentId = targetClass.departmentId;
    }

    // 5. Prevent duplicate applications: Check if an active application for same email + session exists
    const existingActive = await db
      .select({ id: admissionApplications.id, status: admissionApplications.status })
      .from(admissionApplications)
      .where(
        and(
          eq(admissionApplications.email, cleanEmail),
          eq(admissionApplications.sessionId, parsedSessionId),
          inArray(admissionApplications.status, ['pending', 'under_review', 'approved'])
        )
      )
      .limit(1);

    if (existingActive.length > 0) {
      return res.status(400).json({
        error: `An application for ${cleanEmail} has already been submitted for the ${targetSession.name} academic session. Current status: ${existingActive[0].status.replace('_', ' ')}.`,
      });
    }

    // 5.5 Process passport photo & documents with secure StorageService
    let storedPassportUrl: string | null = null;
    if (passportPhoto && typeof passportPhoto === 'string' && passportPhoto.trim()) {
      const trimmedPhoto = passportPhoto.trim();
      if (trimmedPhoto.startsWith('data:')) {
        const savedPhoto = await StorageService.saveFile({
          dataUriOrBuffer: trimmedPhoto,
          category: 'passport_photo',
          isPublic: false,
        });
        storedPassportUrl = `/api/admissions/documents/${savedPhoto.fileId}`;
      } else {
        storedPassportUrl = trimmedPhoto;
      }
    }

    let storedDocumentsJson: string | null = null;
    if (documents) {
      let docArray: any[] = [];
      try {
        docArray = typeof documents === 'string' ? JSON.parse(documents) : documents;
      } catch {
        docArray = [];
      }

      if (Array.isArray(docArray)) {
        const processedDocs = await Promise.all(
          docArray.map(async (doc: any) => {
            if (doc && doc.fileData && typeof doc.fileData === 'string' && doc.fileData.startsWith('data:')) {
              const savedDoc = await StorageService.saveFile({
                dataUriOrBuffer: doc.fileData,
                filename: doc.fileName || doc.title,
                category: 'admission_document',
                isPublic: false,
              });
              return {
                id: doc.id || savedDoc.fileId,
                title: doc.title || 'Document',
                fileId: savedDoc.fileId,
                storageKey: savedDoc.storageKey,
                fileName: savedDoc.filename,
                fileType: savedDoc.mimeType,
                fileSize: savedDoc.size,
                fileData: `/api/admissions/documents/${savedDoc.fileId}`,
                uploadedAt: savedDoc.createdAt,
              };
            }
            return doc;
          })
        );
        storedDocumentsJson = JSON.stringify(processedDocs);
      } else if (typeof documents === 'string') {
        storedDocumentsJson = documents;
      }
    }

    // 6. Generate cryptographic Application Number & Access Key
    const applicationNumber = await generateUniqueApplicationNumber();
    const rawAccessKey = generateSecureToken('APP-KEY');
    const hashedAccessKey = hashToken(rawAccessKey);

    // 7. Atomic record insertion (Only SHA-256 hash is stored in database)
    const createdApp = await db.transaction(async (tx) => {
      const [app] = await tx
        .insert(admissionApplications)
        .values({
          applicationNumber,
          accessKey: hashedAccessKey,
          firstName: firstName.trim(),
          middleName: middleName ? middleName.trim() : null,
          lastName: lastName.trim(),
          dateOfBirth: dateOfBirth.trim(),
          gender,
          email: cleanEmail,
          phone: phone.trim(),
          address: address.trim(),
          sessionId: parsedSessionId,
          classId: parsedClassId,
          departmentId: parsedDepartmentId,
          guardianName: guardianName ? guardianName.trim() : null,
          guardianPhone: guardianPhone ? guardianPhone.trim() : null,
          guardianEmail: guardianEmail ? guardianEmail.trim().toLowerCase() : null,
          guardianRelationship: guardianRelationship ? guardianRelationship.trim() : 'Parent',
          nationality: nationality ? nationality.trim() : null,
          stateOfOrigin: stateOfOrigin ? stateOfOrigin.trim() : null,
          lga: lga ? lga.trim() : null,
          passportPhoto: storedPassportUrl,
          guardianAddress: guardianAddress ? guardianAddress.trim() : null,
          guardianOccupation: guardianOccupation ? guardianOccupation.trim() : null,
          emergencyContactName: emergencyContactName ? emergencyContactName.trim() : null,
          emergencyContactPhone: emergencyContactPhone ? emergencyContactPhone.trim() : null,
          entryMode: entryMode ? entryMode.trim() : null,
          documents: storedDocumentsJson,
          applicantMessage: applicantMessage ? applicantMessage.trim() : null,
          status: 'pending',
        })
        .returning();

      // Application audit log
      await tx.insert(admissionApplicationLogs).values({
        applicationId: app.id,
        action: 'SUBMITTED',
        previousStatus: null,
        newStatus: 'pending',
        notes: 'Application registered through public admissions portal.',
      });

      return app;
    });

    res.status(201).json({
      success: true,
      message: 'Your admission application has been successfully submitted.',
      applicationNumber: createdApp.applicationNumber,
      accessKey: rawAccessKey,
      status: createdApp.status,
      sessionName: targetSession.name,
      className: targetClass.name,
    });
  } catch (error: any) {
    console.error('Submit admission application error:', error);
    res.status(500).json({ error: 'Failed to submit admission application' });
  }
});

// POST /api/admissions/public/track - Public applicant tracks their application status (Rate Limited)
admissionsRouter.post('/public/track', applicationTrackLimiter, async (req, res: Response) => {
  try {
    const { applicationNumber, accessKey } = req.body;
    if (!applicationNumber || !accessKey) {
      return res.status(400).json({ error: 'Application number and access key are required to track status' });
    }

    const cleanNumber = applicationNumber.trim().toUpperCase();
    const cleanKey = accessKey.trim();
    const hashedKey = hashToken(cleanKey);

    const [app] = await db
      .select({
        id: admissionApplications.id,
        applicationNumber: admissionApplications.applicationNumber,
        firstName: admissionApplications.firstName,
        middleName: admissionApplications.middleName,
        lastName: admissionApplications.lastName,
        dateOfBirth: admissionApplications.dateOfBirth,
        gender: admissionApplications.gender,
        email: admissionApplications.email,
        phone: admissionApplications.phone,
        status: admissionApplications.status,
        adminNotes: admissionApplications.adminNotes,
        applicantMessage: admissionApplications.applicantMessage,
        reviewedAt: admissionApplications.reviewedAt,
        approvedStudentId: admissionApplications.approvedStudentId,
        createdAt: admissionApplications.createdAt,
        updatedAt: admissionApplications.updatedAt,
        sessionName: academicSessions.name,
        className: classes.name,
        gradeLevel: classes.gradeLevel,
        departmentName: departments.name,
      })
      .from(admissionApplications)
      .leftJoin(academicSessions, eq(admissionApplications.sessionId, academicSessions.id))
      .leftJoin(classes, eq(admissionApplications.classId, classes.id))
      .leftJoin(departments, eq(admissionApplications.departmentId, departments.id))
      .where(
        and(
          eq(admissionApplications.applicationNumber, cleanNumber),
          or(
            eq(admissionApplications.accessKey, hashedKey),
            eq(admissionApplications.accessKey, cleanKey)
          )
        )
      )
      .limit(1);

    if (!app) {
      return res.status(404).json({ error: 'Application record not found. Please verify your Application Number and Access Key.' });
    }

    // If approved, fetch student ID identifier
    let enrolledStudentId: string | null = null;
    if (app.approvedStudentId) {
      const [stu] = await db
        .select({ studentId: students.studentId })
        .from(students)
        .where(eq(students.id, app.approvedStudentId))
        .limit(1);
      if (stu) {
        enrolledStudentId = stu.studentId;
      }
    }

    // Fetch review history events (redact internal reviewer identities)
    const logs = await db
      .select({
        action: admissionApplicationLogs.action,
        previousStatus: admissionApplicationLogs.previousStatus,
        newStatus: admissionApplicationLogs.newStatus,
        notes: admissionApplicationLogs.notes,
        createdAt: admissionApplicationLogs.createdAt,
      })
      .from(admissionApplicationLogs)
      .where(eq(admissionApplicationLogs.applicationId, app.id))
      .orderBy(desc(admissionApplicationLogs.createdAt));

    res.json({
      applicationNumber: app.applicationNumber,
      applicantName: `${app.firstName} ${app.middleName ? app.middleName + ' ' : ''}${app.lastName}`.trim(),
      email: app.email,
      phone: app.phone,
      status: app.status,
      sessionName: app.sessionName,
      className: app.className,
      gradeLevel: app.gradeLevel,
      departmentName: app.departmentName,
      adminNotes: app.adminNotes,
      reviewedAt: app.reviewedAt,
      enrolledStudentId,
      submissionDate: app.createdAt,
      lastUpdated: app.updatedAt,
      timeline: logs,
    });
  } catch (error: any) {
    console.error('Track application error:', error);
    res.status(500).json({ error: 'Failed to retrieve application status' });
  }
});

// GET /api/admissions/documents/:fileId - Secure Authorized Document Retrieval
admissionsRouter.get('/documents/:fileId', async (req: AuthRequest, res: Response) => {
  try {
    const fileId = req.params.fileId;
    if (!fileId || !/^[a-zA-Z0-9_-]{8,64}$/.test(fileId)) {
      return res.status(400).json({ error: 'Invalid document identifier' });
    }

    // 1. Authorization Verification
    // Staff authorization: super_admin or staff with explicit admissions_management permission
    const isStaffAuthorized = Boolean(
      req.user &&
      (req.user.role === 'super_admin' || hasPermission(req.user, 'admissions_management'))
    );

    // Applicant self-service authorization: matching applicationNumber + accessKey
    const appNumber = (req.query.applicationNumber as string) || (req.headers['x-application-number'] as string);
    const accessKey = (req.query.accessKey as string) || (req.headers['x-access-key'] as string);
    let isApplicantAuthorized = false;

    if (appNumber && accessKey) {
      const hashedKey = hashToken(accessKey.trim());
      const [app] = await db
        .select({
          id: admissionApplications.id,
          passportPhoto: admissionApplications.passportPhoto,
          documents: admissionApplications.documents,
        })
        .from(admissionApplications)
        .where(
          and(
            eq(admissionApplications.applicationNumber, appNumber.trim().toUpperCase()),
            eq(admissionApplications.accessKey, hashedKey)
          )
        )
        .limit(1);

      if (app) {
        const ownsPhoto = app.passportPhoto && app.passportPhoto.includes(fileId);
        const ownsDoc = app.documents && app.documents.includes(fileId);
        if (ownsPhoto || ownsDoc) {
          isApplicantAuthorized = true;
        }
      }
    }

    if (!isStaffAuthorized && !isApplicantAuthorized) {
      return res.status(403).json({ error: 'Forbidden: Unauthorized access to applicant document' });
    }

    // 2. Retrieve document from StorageService
    const stored = await StorageService.getFile(fileId, false);
    if (!stored) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.setHeader('Content-Type', stored.metadata.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${stored.metadata.filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Length', stored.buffer.length);
    return res.end(stored.buffer);
  } catch (error: any) {
    console.error('Document retrieval error:', error);
    return res.status(500).json({ error: 'Failed to retrieve document' });
  }
});

// ============================================================================
// 2. ADMIN ADMISSION MANAGEMENT ENDPOINTS (Super Admin / Staff with admissions_management)
// ============================================================================

// GET /api/admissions/applications - List and filter applications
admissionsRouter.get('/applications', requireAuth, requireRoleOrPermission(['super_admin'], 'admissions_management'), async (req: AuthRequest, res: Response) => {
  try {
    const isAll = req.query.all === 'true' || req.query.limit === 'all';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = isAll ? 500 : Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = isAll ? 0 : (page - 1) * limit;

    const status = (req.query.status as string || '').trim();
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const departmentId = req.query.departmentId ? parseInt(req.query.departmentId as string) : undefined;
    const searchQuery = (req.query.q as string || '').trim();

    const conditions = [];

    if (status && status !== 'all') {
      conditions.push(eq(admissionApplications.status, status));
    }
    if (sessionId) {
      conditions.push(eq(admissionApplications.sessionId, sessionId));
    }
    if (classId) {
      conditions.push(eq(admissionApplications.classId, classId));
    }
    if (departmentId) {
      conditions.push(eq(admissionApplications.departmentId, departmentId));
    }

    if (searchQuery) {
      const pattern = `%${searchQuery}%`;
      conditions.push(
        or(
          ilike(admissionApplications.applicationNumber, pattern),
          ilike(admissionApplications.firstName, pattern),
          ilike(admissionApplications.lastName, pattern),
          ilike(admissionApplications.email, pattern),
          ilike(admissionApplications.phone, pattern),
          ilike(admissionApplications.guardianName, pattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count matching filters
    const [countResult] = await db
      .select({ count: count() })
      .from(admissionApplications)
      .where(whereClause);
    const total = Number(countResult?.count || 0);

    // Status metrics
    const [allCount, pendingCount, reviewCount, infoCount, approvedCount, rejectedCount] = await Promise.all([
      db.select({ count: count() }).from(admissionApplications),
      db.select({ count: count() }).from(admissionApplications).where(eq(admissionApplications.status, 'pending')),
      db.select({ count: count() }).from(admissionApplications).where(eq(admissionApplications.status, 'under_review')),
      db.select({ count: count() }).from(admissionApplications).where(eq(admissionApplications.status, 'needs_information')),
      db.select({ count: count() }).from(admissionApplications).where(eq(admissionApplications.status, 'approved')),
      db.select({ count: count() }).from(admissionApplications).where(eq(admissionApplications.status, 'rejected')),
    ]);

    const applicationsList = await db
      .select({
        id: admissionApplications.id,
        applicationNumber: admissionApplications.applicationNumber,
        firstName: admissionApplications.firstName,
        middleName: admissionApplications.middleName,
        lastName: admissionApplications.lastName,
        dateOfBirth: admissionApplications.dateOfBirth,
        gender: admissionApplications.gender,
        email: admissionApplications.email,
        phone: admissionApplications.phone,
        address: admissionApplications.address,
        sessionId: admissionApplications.sessionId,
        sessionName: academicSessions.name,
        classId: admissionApplications.classId,
        className: classes.name,
        gradeLevel: classes.gradeLevel,
        departmentId: admissionApplications.departmentId,
        departmentName: departments.name,
        departmentCode: departments.code,
        guardianName: admissionApplications.guardianName,
        guardianPhone: admissionApplications.guardianPhone,
        guardianEmail: admissionApplications.guardianEmail,
        guardianRelationship: admissionApplications.guardianRelationship,
        nationality: admissionApplications.nationality,
        stateOfOrigin: admissionApplications.stateOfOrigin,
        lga: admissionApplications.lga,
        passportPhoto: admissionApplications.passportPhoto,
        guardianAddress: admissionApplications.guardianAddress,
        guardianOccupation: admissionApplications.guardianOccupation,
        emergencyContactName: admissionApplications.emergencyContactName,
        emergencyContactPhone: admissionApplications.emergencyContactPhone,
        entryMode: admissionApplications.entryMode,
        documents: admissionApplications.documents,
        status: admissionApplications.status,
        adminNotes: admissionApplications.adminNotes,
        applicantMessage: admissionApplications.applicantMessage,
        reviewedBy: admissionApplications.reviewedBy,
        reviewerName: users.fullName,
        reviewedAt: admissionApplications.reviewedAt,
        approvedStudentId: admissionApplications.approvedStudentId,
        createdAt: admissionApplications.createdAt,
        updatedAt: admissionApplications.updatedAt,
      })
      .from(admissionApplications)
      .leftJoin(academicSessions, eq(admissionApplications.sessionId, academicSessions.id))
      .leftJoin(classes, eq(admissionApplications.classId, classes.id))
      .leftJoin(departments, eq(admissionApplications.departmentId, departments.id))
      .leftJoin(users, eq(admissionApplications.reviewedBy, users.id))
      .where(whereClause)
      .orderBy(desc(admissionApplications.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      data: applicationsList,
      counts: {
        all: Number(allCount[0]?.count || 0),
        pending: Number(pendingCount[0]?.count || 0),
        under_review: Number(reviewCount[0]?.count || 0),
        needs_information: Number(infoCount[0]?.count || 0),
        approved: Number(approvedCount[0]?.count || 0),
        rejected: Number(rejectedCount[0]?.count || 0),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Fetch admissions applications error:', error);
    res.status(500).json({ error: 'Failed to retrieve applications' });
  }
});

// GET /api/admissions/applications/:id - Full application details with history logs
admissionsRouter.get('/applications/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'admissions_management'), async (req: AuthRequest, res: Response) => {
  try {
    const applicationId = parseInt(req.params.id, 10);
    if (isNaN(applicationId)) {
      return res.status(400).json({ error: 'Invalid application ID' });
    }

    const [app] = await db
      .select({
        id: admissionApplications.id,
        applicationNumber: admissionApplications.applicationNumber,
        firstName: admissionApplications.firstName,
        middleName: admissionApplications.middleName,
        lastName: admissionApplications.lastName,
        dateOfBirth: admissionApplications.dateOfBirth,
        gender: admissionApplications.gender,
        email: admissionApplications.email,
        phone: admissionApplications.phone,
        address: admissionApplications.address,
        sessionId: admissionApplications.sessionId,
        sessionName: academicSessions.name,
        classId: admissionApplications.classId,
        className: classes.name,
        gradeLevel: classes.gradeLevel,
        departmentId: admissionApplications.departmentId,
        departmentName: departments.name,
        departmentCode: departments.code,
        guardianName: admissionApplications.guardianName,
        guardianPhone: admissionApplications.guardianPhone,
        guardianEmail: admissionApplications.guardianEmail,
        guardianRelationship: admissionApplications.guardianRelationship,
        nationality: admissionApplications.nationality,
        stateOfOrigin: admissionApplications.stateOfOrigin,
        lga: admissionApplications.lga,
        passportPhoto: admissionApplications.passportPhoto,
        guardianAddress: admissionApplications.guardianAddress,
        guardianOccupation: admissionApplications.guardianOccupation,
        emergencyContactName: admissionApplications.emergencyContactName,
        emergencyContactPhone: admissionApplications.emergencyContactPhone,
        entryMode: admissionApplications.entryMode,
        documents: admissionApplications.documents,
        status: admissionApplications.status,
        adminNotes: admissionApplications.adminNotes,
        applicantMessage: admissionApplications.applicantMessage,
        reviewedBy: admissionApplications.reviewedBy,
        reviewerName: users.fullName,
        reviewedAt: admissionApplications.reviewedAt,
        approvedStudentId: admissionApplications.approvedStudentId,
        createdAt: admissionApplications.createdAt,
        updatedAt: admissionApplications.updatedAt,
      })
      .from(admissionApplications)
      .leftJoin(academicSessions, eq(admissionApplications.sessionId, academicSessions.id))
      .leftJoin(classes, eq(admissionApplications.classId, classes.id))
      .leftJoin(departments, eq(admissionApplications.departmentId, departments.id))
      .leftJoin(users, eq(admissionApplications.reviewedBy, users.id))
      .where(eq(admissionApplications.id, applicationId))
      .limit(1);

    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Fetch student info if approved
    let studentDetails: any = null;
    if (app.approvedStudentId) {
      const [stu] = await db
        .select({
          id: students.id,
          studentId: students.studentId,
          status: students.status,
          admissionDate: students.admissionDate,
        })
        .from(students)
        .where(eq(students.id, app.approvedStudentId))
        .limit(1);
      studentDetails = stu || null;
    }

    // Fetch review logs
    const logs = await db
      .select({
        id: admissionApplicationLogs.id,
        action: admissionApplicationLogs.action,
        previousStatus: admissionApplicationLogs.previousStatus,
        newStatus: admissionApplicationLogs.newStatus,
        notes: admissionApplicationLogs.notes,
        performedBy: admissionApplicationLogs.performedBy,
        performerName: users.fullName,
        createdAt: admissionApplicationLogs.createdAt,
      })
      .from(admissionApplicationLogs)
      .leftJoin(users, eq(admissionApplicationLogs.performedBy, users.id))
      .where(eq(admissionApplicationLogs.applicationId, applicationId))
      .orderBy(desc(admissionApplicationLogs.createdAt));

    res.json({
      application: app,
      student: studentDetails,
      logs,
    });
  } catch (error: any) {
    console.error('Fetch application details error:', error);
    res.status(500).json({ error: 'Failed to retrieve application details' });
  }
});

// PATCH /api/admissions/applications/:id/status - Update status to under_review or update notes
admissionsRouter.patch('/applications/:id/status', requireAuth, requireRoleOrPermission(['super_admin'], 'admissions_management'), async (req: AuthRequest, res: Response) => {
  try {
    const applicationId = parseInt(req.params.id, 10);
    const { status, notes } = req.body;

    const [existing] = await db
      .select()
      .from(admissionApplications)
      .where(eq(admissionApplications.id, applicationId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (existing.status === 'approved') {
      return res.status(400).json({ error: 'Approved applications cannot have their status altered here.' });
    }

    const validStatuses = ['pending', 'under_review', 'needs_information', 'rejected'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const targetStatus = status || existing.status;
    const cleanNotes = notes !== undefined ? (notes ? notes.trim() : null) : existing.adminNotes;

    const [updated] = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(admissionApplications)
        .set({
          status: targetStatus,
          adminNotes: cleanNotes,
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(admissionApplications.id, applicationId))
        .returning();

      await tx.insert(admissionApplicationLogs).values({
        applicationId,
        action: 'STATUS_CHANGE',
        previousStatus: existing.status,
        newStatus: targetStatus,
        notes: cleanNotes || `Status updated to ${targetStatus}`,
        performedBy: req.user!.id,
      });

      return [u];
    });

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'ADMISSION_STATUS_UPDATED',
      resource: 'admission_applications',
      resourceId: applicationId.toString(),
      details: { previousStatus: existing.status, newStatus: targetStatus, applicationNumber: existing.applicationNumber },
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Update application status error:', error);
    res.status(500).json({ error: 'Failed to update application status' });
  }
});

// POST /api/admissions/applications/:id/request-info - Request additional information from applicant
admissionsRouter.post('/api/admissions/applications/:id/request-info', requireAuth, requireRoleOrPermission(['super_admin'], 'admissions_management'), async (req: AuthRequest, res: Response) => {
  return handleRequestInfo(req, res);
});
admissionsRouter.post('/applications/:id/request-info', requireAuth, requireRoleOrPermission(['super_admin'], 'admissions_management'), async (req: AuthRequest, res: Response) => {
  return handleRequestInfo(req, res);
});

async function handleRequestInfo(req: AuthRequest, res: Response) {
  try {
    const applicationId = parseInt(req.params.id, 10);
    const { notes } = req.body;

    if (!notes || !notes.trim()) {
      return res.status(400).json({ error: 'Please specify the information or documents required from the applicant.' });
    }

    const [existing] = await db
      .select()
      .from(admissionApplications)
      .where(eq(admissionApplications.id, applicationId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (existing.status === 'approved') {
      return res.status(400).json({ error: 'Application has already been approved.' });
    }

    const cleanNotes = notes.trim();

    const [updated] = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(admissionApplications)
        .set({
          status: 'needs_information',
          adminNotes: cleanNotes,
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(admissionApplications.id, applicationId))
        .returning();

      await tx.insert(admissionApplicationLogs).values({
        applicationId,
        action: 'INFO_REQUESTED',
        previousStatus: existing.status,
        newStatus: 'needs_information',
        notes: cleanNotes,
        performedBy: req.user!.id,
      });

      return [u];
    });

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'ADMISSION_INFO_REQUESTED',
      resource: 'admission_applications',
      resourceId: applicationId.toString(),
      details: { applicationNumber: existing.applicationNumber, requestedNotes: cleanNotes },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Applicant notified for additional information', application: updated });
  } catch (error: any) {
    console.error('Request info error:', error);
    res.status(500).json({ error: 'Failed to request additional information' });
  }
}

// POST /api/admissions/applications/:id/reject - Reject admission application
admissionsRouter.post('/applications/:id/reject', requireAuth, requireRoleOrPermission(['super_admin'], 'admissions_management'), async (req: AuthRequest, res: Response) => {
  try {
    const applicationId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    const [existing] = await db
      .select()
      .from(admissionApplications)
      .where(eq(admissionApplications.id, applicationId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (existing.status === 'approved') {
      return res.status(400).json({ error: 'Approved applications cannot be rejected after student enrollment.' });
    }

    const cleanReason = reason ? reason.trim() : 'Application does not meet current admission requirements.';

    const [updated] = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(admissionApplications)
        .set({
          status: 'rejected',
          adminNotes: cleanReason,
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(admissionApplications.id, applicationId))
        .returning();

      await tx.insert(admissionApplicationLogs).values({
        applicationId,
        action: 'REJECTED',
        previousStatus: existing.status,
        newStatus: 'rejected',
        notes: cleanReason,
        performedBy: req.user!.id,
      });

      return [u];
    });

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'ADMISSION_APPLICATION_REJECTED',
      resource: 'admission_applications',
      resourceId: applicationId.toString(),
      details: { applicationNumber: existing.applicationNumber, reason: cleanReason },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Application rejected', application: updated });
  } catch (error: any) {
    console.error('Reject application error:', error);
    res.status(500).json({ error: 'Failed to reject application' });
  }
});

// POST /api/admissions/applications/:id/approve - Approve application & enroll student (Transaction Guarded)
admissionsRouter.post('/applications/:id/approve', requireAuth, requireRoleOrPermission(['super_admin'], 'admissions_management'), async (req: AuthRequest, res: Response) => {
  try {
    const applicationId = parseInt(req.params.id, 10);
    const { notes } = req.body;

    // Fetch existing application
    const [existingApp] = await db
      .select()
      .from(admissionApplications)
      .where(eq(admissionApplications.id, applicationId))
      .limit(1);

    if (!existingApp) {
      return res.status(404).json({ error: 'Application record not found' });
    }

    // Race-condition prevention: Check if already approved
    if (existingApp.status === 'approved' || existingApp.approvedStudentId) {
      return res.status(409).json({ error: 'This application has already been approved and student record created.' });
    }

    // Validate class and session
    const [targetClass] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, existingApp.classId), eq(classes.status, 'active')))
      .limit(1);
    if (!targetClass) {
      return res.status(400).json({ error: 'Cannot enroll: Selected class is inactive or no longer exists.' });
    }

    const [targetSession] = await db
      .select()
      .from(academicSessions)
      .where(eq(academicSessions.id, existingApp.sessionId))
      .limit(1);
    if (!targetSession) {
      return res.status(400).json({ error: 'Cannot enroll: Selected academic session no longer exists.' });
    }

    // Generate unique student ID and enrollment token for student invitation/activation workflow
    const studentId = await generateUniqueStudentId();
    const rawEnrollmentToken = generateSecureToken('ENR');
    const enrollmentTokenHash = hashToken(rawEnrollmentToken);
    const enrollmentTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const admissionDate = new Date().toISOString().split('T')[0];

    // Format emergency contact string from guardian details
    let emergencyContact: string | null = null;
    if (existingApp.guardianName || existingApp.guardianPhone) {
      emergencyContact = `${existingApp.guardianName || 'Guardian'} (${existingApp.guardianRelationship || 'Parent'}): ${existingApp.guardianPhone || 'N/A'}`;
      if (existingApp.guardianEmail) {
        emergencyContact += ` [${existingApp.guardianEmail}]`;
      }
    }

    const cleanNotes = notes ? notes.trim() : 'Application officially approved and student admitted.';

    // =========================================================================
    // ATOMIC TRANSACTION: Student Creation + Enrollment + Status Update
    // =========================================================================
    const result = await db.transaction(async (tx) => {
      // Secondary race-condition lock check inside transaction
      const [lockedApp] = await tx
        .select()
        .from(admissionApplications)
        .where(eq(admissionApplications.id, applicationId))
        .limit(1);

      if (lockedApp.status === 'approved' || lockedApp.approvedStudentId) {
        throw new Error('Application was already approved in a concurrent transaction.');
      }

      // 1. Insert student profile
      const [newStudent] = await tx
        .insert(students)
        .values({
          studentId,
          firstName: existingApp.firstName,
          lastName: existingApp.lastName,
          dateOfBirth: existingApp.dateOfBirth,
          gender: existingApp.gender,
          classId: existingApp.classId,
          currentSessionId: existingApp.sessionId,
          admissionDate,
          address: existingApp.address,
          emergencyContact,
          status: 'active',
          enrollmentToken: enrollmentTokenHash,
          enrollmentTokenExpiresAt,
        })
        .returning();

      // 2. Insert student enrollment record
      await tx
        .insert(studentEnrollments)
        .values({
          studentId: newStudent.id,
          classId: existingApp.classId,
          sessionId: existingApp.sessionId,
          enrollmentDate: admissionDate,
          status: 'enrolled',
        })
        .onConflictDoNothing();

      // 3. Update application status to approved and tie to student profile
      const [updatedApp] = await tx
        .update(admissionApplications)
        .set({
          status: 'approved',
          approvedStudentId: newStudent.id,
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
          adminNotes: cleanNotes,
          updatedAt: new Date(),
        })
        .where(eq(admissionApplications.id, applicationId))
        .returning();

      // 4. Log review activity
      await tx.insert(admissionApplicationLogs).values({
        applicationId,
        action: 'APPROVED',
        previousStatus: existingApp.status,
        newStatus: 'approved',
        notes: cleanNotes,
        performedBy: req.user!.id,
      });

      return {
        student: newStudent,
        application: updatedApp,
      };
    });

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'ADMISSION_APPLICATION_APPROVED',
      resource: 'admission_applications',
      resourceId: applicationId.toString(),
      details: {
        applicationNumber: existingApp.applicationNumber,
        studentId: result.student.studentId,
        classId: existingApp.classId,
        sessionId: existingApp.sessionId,
      },
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `Application approved! Student record created with Official ID: ${result.student.studentId}`,
      student: {
        id: result.student.id,
        studentId: result.student.studentId,
        name: `${result.student.firstName} ${result.student.lastName}`,
        classId: result.student.classId,
        currentSessionId: result.student.currentSessionId,
        admissionDate: result.student.admissionDate,
      },
      enrollmentToken: rawEnrollmentToken,
      application: result.application,
    });
  } catch (error: any) {
    console.error('Approve application error:', error);
    res.status(error.message?.includes('concurrent') ? 409 : 500).json({
      error: error.message || 'Failed to approve application and enroll student',
    });
  }
});
