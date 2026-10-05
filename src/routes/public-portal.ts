import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import {
  publicPortalSettings,
  publicPortalHeroSlides,
  blogPosts,
  blogCategories,
  importantDates,
  admissionRequirements,
  faqs,
  classes,
  departments,
  academicSessions,
  schoolSettings,
} from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole, hasPermission } from '../middleware/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { sanitizeHtml, slugify } from '../lib/sanitize.ts';
import { eq, and, or, desc, asc, ilike, inArray, count, sql } from 'drizzle-orm';
import { StorageService } from '../lib/storage.ts';

export const publicPortalRouter = Router();

// Middleware to authorize Super Admins or Staff with Public Portal / Visual Editor permissions
export const requirePortalAdmin = (req: AuthRequest, res: Response, next: any) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (
    req.user.role === 'super_admin' ||
    hasPermission(req.user, 'public_portal_management') ||
    hasPermission(req.user, 'visual_page_editor')
  ) {
    return next();
  }
  return res.status(403).json({
    error: 'Forbidden: Access requires Public Portal Management or Visual Page Editor administrative permission.',
  });
};

// ============================================================================
// 1. PUBLIC ENDPOINTS (No Authentication Required)
// ============================================================================

// Helper to get or initialize portal settings
export async function getOrCreatePortalSettings() {
  const [existing] = await db.select().from(publicPortalSettings).limit(1);
  if (existing) return existing;

  const [activeSession] = await db
    .select({ id: academicSessions.id })
    .from(academicSessions)
    .where(eq(academicSessions.isCurrent, true))
    .limit(1);

  const [created] = await db
    .insert(publicPortalSettings)
    .values({
      portalEnabled: true,
      admissionsOpen: true,
      openingDate: '2026-08-01',
      closingDate: '2027-01-31',
      currentSessionId: activeSession?.id || null,
      announcementMessage: 'Applications are now officially open for admission into accredited programmes.',
      applicationInstructions: '1. Select your target program/class.\n2. Complete applicant details & guardian information.\n3. Keep your Application Number and Access Key safe to track your admission status live.',
      applicationFee: '0.00',
      admissionsContactInfo: 'Admissions Office: admissions@school.edu • Direct Line: +234 803 111 2233',
      showPrograms: true,
      showRequirements: true,
      showImportantDates: true,
      showNews: true,
      showFaqs: true,
      showContact: true,
      heroTitle: "Let's fly to your Dream Academy",
      heroSubtitle: 'Your dream education is just a few clicks away — no stress, no complexity. Apply smart, verify credentials, and track your admission progress live.',
      heroBadgeText: 'Admissions Intake Open',
      officeHours: 'Mon - Fri • 8:00 AM - 5:00 PM',
    })
    .returning();

  return created;
}

// GET /api/public-portal/content - Combined bundle for the public admissions page
publicPortalRouter.get('/content', async (_req, res: Response) => {
  try {
    const portalSetting = await getOrCreatePortalSettings();

    const [
      schoolSettingList,
      publicClasses,
      publishedPosts,
      visibleDates,
      visibleRequirements,
      publishedFaqs,
      allDepts,
      allSessions,
      activeHeroSlides,
    ] = await Promise.all([
      db.select().from(schoolSettings).limit(1),

      // Programs / Classes that are publicly visible and not hidden
      db
        .select({
          id: classes.id,
          name: classes.name,
          section: classes.section,
          gradeLevel: classes.gradeLevel,
          sessionId: classes.sessionId,
          departmentId: classes.departmentId,
          departmentName: departments.name,
          departmentCode: departments.code,
          capacity: classes.capacity,
          duration: classes.duration,
          publicDescription: classes.publicDescription,
          requirements: classes.requirements,
          admissionStatus: classes.admissionStatus,
          isFeatured: classes.isFeatured,
          status: classes.status,
        })
        .from(classes)
        .leftJoin(departments, eq(classes.departmentId, departments.id))
        .where(
          and(
            eq(classes.status, 'active'),
            eq(classes.isPubliclyVisible, true),
            inArray(classes.admissionStatus, ['available', 'closed'])
          )
        )
        .orderBy(desc(classes.isFeatured), asc(classes.name)),

      // Published Blog / News Posts
      db
        .select({
          id: blogPosts.id,
          title: blogPosts.title,
          slug: blogPosts.slug,
          summary: blogPosts.summary,
          content: blogPosts.content,
          featuredImage: blogPosts.featuredImage,
          category: blogPosts.category,
          authorName: blogPosts.authorName,
          publishedAt: blogPosts.publishedAt,
          isFeatured: blogPosts.isFeatured,
          viewsCount: blogPosts.viewsCount,
        })
        .from(blogPosts)
        .where(eq(blogPosts.status, 'published'))
        .orderBy(desc(blogPosts.isFeatured), desc(blogPosts.publishedAt), desc(blogPosts.createdAt))
        .limit(10),

      // Important Dates
      db
        .select()
        .from(importantDates)
        .where(eq(importantDates.isPubliclyVisible, true))
        .orderBy(asc(importantDates.displayOrder), asc(importantDates.eventDate)),

      // Admission Requirements
      db
        .select({
          id: admissionRequirements.id,
          title: admissionRequirements.title,
          description: admissionRequirements.description,
          scope: admissionRequirements.scope,
          departmentId: admissionRequirements.departmentId,
          departmentName: departments.name,
          classId: admissionRequirements.classId,
          className: classes.name,
          isMandatory: admissionRequirements.isMandatory,
          displayOrder: admissionRequirements.displayOrder,
        })
        .from(admissionRequirements)
        .leftJoin(departments, eq(admissionRequirements.departmentId, departments.id))
        .leftJoin(classes, eq(admissionRequirements.classId, classes.id))
        .where(eq(admissionRequirements.isPubliclyVisible, true))
        .orderBy(asc(admissionRequirements.displayOrder), asc(admissionRequirements.id)),

      // FAQs
      db
        .select()
        .from(faqs)
        .where(eq(faqs.isPublished, true))
        .orderBy(asc(faqs.displayOrder), asc(faqs.id)),

      // Active Departments
      db
        .select({
          id: departments.id,
          code: departments.code,
          name: departments.name,
          description: departments.description,
        })
        .from(departments)
        .where(eq(departments.status, 'active'))
        .orderBy(departments.name),

      // Sessions
      db
        .select({
          id: academicSessions.id,
          name: academicSessions.name,
          startDate: academicSessions.startDate,
          endDate: academicSessions.endDate,
          isCurrent: academicSessions.isCurrent,
          status: academicSessions.status,
        })
        .from(academicSessions)
        .where(inArray(academicSessions.status, ['active', 'upcoming']))
        .orderBy(desc(academicSessions.isCurrent), desc(academicSessions.startDate)),

      // Active Hero Slides
      db
        .select()
        .from(publicPortalHeroSlides)
        .where(eq(publicPortalHeroSlides.isActive, true))
        .orderBy(asc(publicPortalHeroSlides.displayOrder), asc(publicPortalHeroSlides.id)),
    ]);

    const schoolSetting = schoolSettingList[0] || {
      schoolName: 'School Management System',
      motto: 'Integrated Academic & Administrative Platform',
      contactEmail: 'admissions@school.edu',
      contactPhone: '+234 803 111 2233',
      address: '14 Academy Boulevard, Education District, Lagos',
      currencySymbol: '$',
      timezone: 'Africa/Lagos',
    };

    const today = new Date().toISOString().split('T')[0];
    const isAdmissionsActive =
      portalSetting.admissionsOpen &&
      (!portalSetting.openingDate || today >= portalSetting.openingDate) &&
      (!portalSetting.closingDate || today <= portalSetting.closingDate);

    // Current academic session name lookup
    const currentSession = allSessions.find((s) => s.id === portalSetting.currentSessionId) || allSessions.find((s) => s.isCurrent) || allSessions[0];

    res.json({
      settings: {
        ...portalSetting,
        heroPrimaryCtaText: portalSetting.heroPrimaryCtaText || 'Apply Online',
        heroSecondaryCtaText: portalSetting.heroSecondaryCtaText || 'Track Status',
        schoolName: schoolSetting.schoolName,
        motto: schoolSetting.motto,
        contactEmail: portalSetting.admissionsContactInfo || schoolSetting.contactEmail,
        contactPhone: schoolSetting.contactPhone,
        address: schoolSetting.address,
        currencySymbol: schoolSetting.currencySymbol,
        timezone: schoolSetting.timezone,
        currentSessionName: currentSession?.name || '2026/2027 Academic Session',
        isAdmissionsActive,
      },
      heroSlides: activeHeroSlides,
      admissionsControl: {
        admissionsOpen: portalSetting.admissionsOpen,
        openingDate: portalSetting.openingDate,
        closingDate: portalSetting.closingDate,
        currentSessionId: portalSetting.currentSessionId,
        currentSessionName: currentSession?.name || '2026/2027',
        announcementMessage: portalSetting.announcementMessage,
        applicationInstructions: portalSetting.applicationInstructions,
        applicationFee: portalSetting.applicationFee,
        admissionsContactInfo: portalSetting.admissionsContactInfo,
        isAdmissionsActive,
      },
      programs: publicClasses,
      news: publishedPosts,
      dates: visibleDates,
      requirements: visibleRequirements,
      faqs: publishedFaqs,
      departments: allDepts,
      sessions: allSessions,
    });
  } catch (error: any) {
    console.error('Fetch public portal content error:', error);
    res.status(500).json({ error: 'Failed to retrieve public portal content' });
  }
});

// GET /api/public-portal/news - Search & filter published blog posts
publicPortalRouter.get('/news', async (req, res: Response) => {
  try {
    const category = (req.query.category as string || '').trim();
    const search = (req.query.q as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 12));
    const offset = (page - 1) * limit;

    const conditions = [eq(blogPosts.status, 'published')];

    if (category && category !== 'all') {
      conditions.push(eq(blogPosts.category, category));
    }
    if (search) {
      conditions.push(or(ilike(blogPosts.title, `%${search}%`), ilike(blogPosts.summary, `%${search}%`))!);
    }

    const [posts, totalResult, categories] = await Promise.all([
      db
        .select({
          id: blogPosts.id,
          title: blogPosts.title,
          slug: blogPosts.slug,
          summary: blogPosts.summary,
          featuredImage: blogPosts.featuredImage,
          category: blogPosts.category,
          authorName: blogPosts.authorName,
          publishedAt: blogPosts.publishedAt,
          isFeatured: blogPosts.isFeatured,
          viewsCount: blogPosts.viewsCount,
          createdAt: blogPosts.createdAt,
        })
        .from(blogPosts)
        .where(and(...conditions))
        .orderBy(desc(blogPosts.isFeatured), desc(blogPosts.publishedAt), desc(blogPosts.createdAt))
        .limit(limit)
        .offset(offset),

      db
        .select({ count: count() })
        .from(blogPosts)
        .where(and(...conditions)),

      db.select().from(blogCategories).orderBy(blogCategories.name),
    ]);

    const total = Number(totalResult[0]?.count || 0);

    res.json({
      data: posts,
      categories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Fetch public news error:', error);
    res.status(500).json({ error: 'Failed to retrieve news articles' });
  }
});

// GET /api/public-portal/news/:slug - Fetch individual published post & related posts
publicPortalRouter.get('/news/:slug', async (req, res: Response) => {
  try {
    const slug = req.params.slug.trim();

    const [post] = await db
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, 'published')))
      .limit(1);

    if (!post) {
      return res.status(404).json({ error: 'Article not found or is no longer published.' });
    }

    // Increment views count asynchronously
    db.update(blogPosts)
      .set({ viewsCount: sql`${blogPosts.viewsCount} + 1` })
      .where(eq(blogPosts.id, post.id))
      .catch((err) => console.error('Increment post views error:', err));

    // Fetch related articles in same category
    const relatedPosts = await db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        summary: blogPosts.summary,
        featuredImage: blogPosts.featuredImage,
        category: blogPosts.category,
        authorName: blogPosts.authorName,
        publishedAt: blogPosts.publishedAt,
      })
      .from(blogPosts)
      .where(
        and(
          eq(blogPosts.status, 'published'),
          eq(blogPosts.category, post.category),
          sql`${blogPosts.id} != ${post.id}`
        )
      )
      .orderBy(desc(blogPosts.publishedAt))
      .limit(3);

    res.json({
      post,
      relatedPosts,
    });
  } catch (error: any) {
    console.error('Fetch post by slug error:', error);
    res.status(500).json({ error: 'Failed to retrieve article details' });
  }
});

// GET /api/public-portal/programs - Filterable academic programs
publicPortalRouter.get('/programs', async (req, res: Response) => {
  try {
    const departmentId = req.query.departmentId ? parseInt(req.query.departmentId as string) : undefined;
    const search = (req.query.q as string || '').trim();

    const conditions = [
      eq(classes.status, 'active'),
      eq(classes.isPubliclyVisible, true),
      inArray(classes.admissionStatus, ['available', 'closed']),
    ];

    if (departmentId) {
      conditions.push(eq(classes.departmentId, departmentId));
    }
    if (search) {
      conditions.push(or(ilike(classes.name, `%${search}%`), ilike(classes.gradeLevel, `%${search}%`))!);
    }

    const progs = await db
      .select({
        id: classes.id,
        name: classes.name,
        section: classes.section,
        gradeLevel: classes.gradeLevel,
        sessionId: classes.sessionId,
        departmentId: classes.departmentId,
        departmentName: departments.name,
        capacity: classes.capacity,
        duration: classes.duration,
        publicDescription: classes.publicDescription,
        requirements: classes.requirements,
        admissionStatus: classes.admissionStatus,
        isFeatured: classes.isFeatured,
      })
      .from(classes)
      .leftJoin(departments, eq(classes.departmentId, departments.id))
      .where(and(...conditions))
      .orderBy(desc(classes.isFeatured), asc(classes.name));

    res.json({ programs: progs });
  } catch (error: any) {
    console.error('Fetch public programs error:', error);
    res.status(500).json({ error: 'Failed to retrieve academic programs' });
  }
});

// ============================================================================
// 2. ADMIN CMS MANAGEMENT ENDPOINTS (super_admin only)
// ============================================================================

// GET /api/public-portal/admin/overview - High-level metrics for CMS dashboard
publicPortalRouter.get('/admin/overview', requireAuth, requirePortalAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const [
      portalSetting,
      totalClasses,
      availableClasses,
      closedClasses,
      hiddenClasses,
      postsCount,
      publishedPosts,
      faqsCount,
      datesCount,
      reqsCount,
    ] = await Promise.all([
      getOrCreatePortalSettings(),
      db.select({ count: count() }).from(classes).where(eq(classes.status, 'active')),
      db.select({ count: count() }).from(classes).where(and(eq(classes.status, 'active'), eq(classes.admissionStatus, 'available'), eq(classes.isPubliclyVisible, true))),
      db.select({ count: count() }).from(classes).where(and(eq(classes.status, 'active'), eq(classes.admissionStatus, 'closed'))),
      db.select({ count: count() }).from(classes).where(or(eq(classes.admissionStatus, 'hidden'), eq(classes.isPubliclyVisible, false))),
      db.select({ count: count() }).from(blogPosts),
      db.select({ count: count() }).from(blogPosts).where(eq(blogPosts.status, 'published')),
      db.select({ count: count() }).from(faqs),
      db.select({ count: count() }).from(importantDates),
      db.select({ count: count() }).from(admissionRequirements),
    ]);

    const today = new Date().toISOString().split('T')[0];
    const isAdmissionsActive =
      portalSetting.admissionsOpen &&
      (!portalSetting.openingDate || today >= portalSetting.openingDate) &&
      (!portalSetting.closingDate || today <= portalSetting.closingDate);

    res.json({
      portalEnabled: portalSetting.portalEnabled,
      admissionsOpen: portalSetting.admissionsOpen,
      isAdmissionsActive,
      openingDate: portalSetting.openingDate,
      closingDate: portalSetting.closingDate,
      programs: {
        total: Number(totalClasses[0]?.count || 0),
        available: Number(availableClasses[0]?.count || 0),
        closed: Number(closedClasses[0]?.count || 0),
        hidden: Number(hiddenClasses[0]?.count || 0),
      },
      news: {
        total: Number(postsCount[0]?.count || 0),
        published: Number(publishedPosts[0]?.count || 0),
      },
      faqs: Number(faqsCount[0]?.count || 0),
      dates: Number(datesCount[0]?.count || 0),
      requirements: Number(reqsCount[0]?.count || 0),
    });
  } catch (error: any) {
    console.error('Fetch CMS overview error:', error);
    res.status(500).json({ error: 'Failed to retrieve portal management overview' });
  }
});

// GET /api/public-portal/admin/settings - Retrieve all portal settings
publicPortalRouter.get('/admin/settings', requireAuth, requirePortalAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const [portalSetting, schoolSettingList, sessions] = await Promise.all([
      getOrCreatePortalSettings(),
      db.select().from(schoolSettings).limit(1),
      db.select({ id: academicSessions.id, name: academicSessions.name, isCurrent: academicSessions.isCurrent }).from(academicSessions),
    ]);

    res.json({
      portalSettings: portalSetting,
      schoolSettings: schoolSettingList[0] || {},
      sessions,
    });
  } catch (error: any) {
    console.error('Fetch admin portal settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve portal settings' });
  }
});

// PUT /api/public-portal/admin/settings - Update portal & admissions configuration
publicPortalRouter.put('/admin/settings', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await getOrCreatePortalSettings();
    const {
      portalEnabled,
      admissionsOpen,
      openingDate,
      closingDate,
      currentSessionId,
      announcementMessage,
      applicationInstructions,
      applicationFee,
      admissionsContactInfo,
      showPrograms,
      showRequirements,
      showImportantDates,
      showNews,
      showFaqs,
      showContact,
      heroTitle,
      heroSubtitle,
      heroBadgeText,
      websiteUrl,
      facebookUrl,
      twitterUrl,
      instagramUrl,
      linkedinUrl,
      officeHours,
      // School identity fields
      schoolName,
      motto,
      contactEmail,
      contactPhone,
      address,
    } = req.body;

    const [updated] = await db
      .update(publicPortalSettings)
      .set({
        portalEnabled: portalEnabled !== undefined ? Boolean(portalEnabled) : existing.portalEnabled,
        admissionsOpen: admissionsOpen !== undefined ? Boolean(admissionsOpen) : existing.admissionsOpen,
        openingDate: openingDate !== undefined ? (openingDate ? String(openingDate).trim() : null) : existing.openingDate,
        closingDate: closingDate !== undefined ? (closingDate ? String(closingDate).trim() : null) : existing.closingDate,
        currentSessionId: currentSessionId ? parseInt(currentSessionId, 10) : existing.currentSessionId,
        announcementMessage: announcementMessage !== undefined ? String(announcementMessage).trim() : existing.announcementMessage,
        applicationInstructions: applicationInstructions !== undefined ? String(applicationInstructions).trim() : existing.applicationInstructions,
        applicationFee: applicationFee !== undefined ? String(applicationFee).trim() : existing.applicationFee,
        admissionsContactInfo: admissionsContactInfo !== undefined ? String(admissionsContactInfo).trim() : existing.admissionsContactInfo,
        showPrograms: showPrograms !== undefined ? Boolean(showPrograms) : existing.showPrograms,
        showRequirements: showRequirements !== undefined ? Boolean(showRequirements) : existing.showRequirements,
        showImportantDates: showImportantDates !== undefined ? Boolean(showImportantDates) : existing.showImportantDates,
        showNews: showNews !== undefined ? Boolean(showNews) : existing.showNews,
        showFaqs: showFaqs !== undefined ? Boolean(showFaqs) : existing.showFaqs,
        showContact: showContact !== undefined ? Boolean(showContact) : existing.showContact,
        heroTitle: heroTitle !== undefined ? String(heroTitle).trim() : existing.heroTitle,
        heroSubtitle: heroSubtitle !== undefined ? String(heroSubtitle).trim() : existing.heroSubtitle,
        heroBadgeText: heroBadgeText !== undefined ? String(heroBadgeText).trim() : existing.heroBadgeText,
        websiteUrl: websiteUrl !== undefined ? (websiteUrl ? String(websiteUrl).trim() : null) : existing.websiteUrl,
        facebookUrl: facebookUrl !== undefined ? (facebookUrl ? String(facebookUrl).trim() : null) : existing.facebookUrl,
        twitterUrl: twitterUrl !== undefined ? (twitterUrl ? String(twitterUrl).trim() : null) : existing.twitterUrl,
        instagramUrl: instagramUrl !== undefined ? (instagramUrl ? String(instagramUrl).trim() : null) : existing.instagramUrl,
        linkedinUrl: linkedinUrl !== undefined ? (linkedinUrl ? String(linkedinUrl).trim() : null) : existing.linkedinUrl,
        officeHours: officeHours !== undefined ? (officeHours ? String(officeHours).trim() : null) : existing.officeHours,
        updatedAt: new Date(),
      })
      .where(eq(publicPortalSettings.id, existing.id))
      .returning();

    // Also sync school settings if provided
    if (schoolName || motto || contactEmail || contactPhone || address) {
      const [existingSchool] = await db.select().from(schoolSettings).limit(1);
      if (existingSchool) {
        await db
          .update(schoolSettings)
          .set({
            schoolName: schoolName !== undefined ? String(schoolName).trim() : existingSchool.schoolName,
            motto: motto !== undefined ? String(motto).trim() : existingSchool.motto,
            contactEmail: contactEmail !== undefined ? String(contactEmail).trim() : existingSchool.contactEmail,
            contactPhone: contactPhone !== undefined ? String(contactPhone).trim() : existingSchool.contactPhone,
            address: address !== undefined ? String(address).trim() : existingSchool.address,
            updatedAt: new Date(),
          })
          .where(eq(schoolSettings.id, existingSchool.id));
      }
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'PUBLIC_PORTAL_SETTINGS_UPDATED',
      resource: 'public_portal_settings',
      resourceId: existing.id.toString(),
      details: { admissionsOpen: updated.admissionsOpen, portalEnabled: updated.portalEnabled },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Public portal settings updated successfully', settings: updated });
  } catch (error: any) {
    console.error('Update portal settings error:', error);
    res.status(500).json({ error: 'Failed to update portal settings' });
  }
});

// ============================================================================
// Programs / Courses Management (Classes)
// ============================================================================

// GET /api/public-portal/admin/programs - List all academic programs with public fields
publicPortalRouter.get('/admin/programs', requireAuth, requirePortalAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const list = await db
      .select({
        id: classes.id,
        name: classes.name,
        section: classes.section,
        gradeLevel: classes.gradeLevel,
        sessionId: classes.sessionId,
        sessionName: academicSessions.name,
        departmentId: classes.departmentId,
        departmentName: departments.name,
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
      .leftJoin(academicSessions, eq(classes.sessionId, academicSessions.id))
      .leftJoin(departments, eq(classes.departmentId, departments.id))
      .where(eq(classes.status, 'active'))
      .orderBy(desc(classes.isFeatured), asc(classes.name));

    const allDepts = await db.select().from(departments).where(eq(departments.status, 'active'));

    res.json({ programs: list, departments: allDepts });
  } catch (error: any) {
    console.error('Fetch admin programs error:', error);
    res.status(500).json({ error: 'Failed to retrieve academic offerings' });
  }
});

// PATCH /api/public-portal/admin/programs/:id - Update public offering settings
publicPortalRouter.patch('/admin/programs/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const { admissionStatus, isPubliclyVisible, publicDescription, duration, requirements, isFeatured } = req.body;

    const [existing] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Class/offering record not found' });
    }

    const validAdmissionStatuses = ['available', 'closed', 'hidden'];
    if (admissionStatus && !validAdmissionStatuses.includes(admissionStatus)) {
      return res.status(400).json({ error: 'Invalid admission status. Must be available, closed, or hidden.' });
    }

    const [updated] = await db
      .update(classes)
      .set({
        admissionStatus: admissionStatus !== undefined ? admissionStatus : existing.admissionStatus,
        isPubliclyVisible: isPubliclyVisible !== undefined ? Boolean(isPubliclyVisible) : existing.isPubliclyVisible,
        publicDescription: publicDescription !== undefined ? (publicDescription ? String(publicDescription).trim() : null) : existing.publicDescription,
        duration: duration !== undefined ? (duration ? String(duration).trim() : null) : existing.duration,
        requirements: requirements !== undefined ? (requirements ? String(requirements).trim() : null) : existing.requirements,
        isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : existing.isFeatured,
      })
      .where(eq(classes.id, classId))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'PROGRAM_PUBLIC_SETTINGS_UPDATED',
      resource: 'classes',
      resourceId: classId.toString(),
      details: { admissionStatus: updated.admissionStatus, isPubliclyVisible: updated.isPubliclyVisible, name: updated.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Program settings updated for ${updated.name}`, program: updated });
  } catch (error: any) {
    console.error('Update program error:', error);
    res.status(500).json({ error: 'Failed to update academic program settings' });
  }
});

// ============================================================================
// Blog / News Management
// ============================================================================

// GET /api/public-portal/admin/news - List all posts for admin
publicPortalRouter.get('/admin/news', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const status = (req.query.status as string || '').trim();
    const search = (req.query.q as string || '').trim();

    const conditions = [];
    if (status && status !== 'all') {
      conditions.push(eq(blogPosts.status, status));
    }
    if (search) {
      conditions.push(or(ilike(blogPosts.title, `%${search}%`), ilike(blogPosts.category, `%${search}%`))!);
    }

    const posts = await db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        summary: blogPosts.summary,
        category: blogPosts.category,
        authorName: blogPosts.authorName,
        status: blogPosts.status,
        publishedAt: blogPosts.publishedAt,
        isFeatured: blogPosts.isFeatured,
        viewsCount: blogPosts.viewsCount,
        createdAt: blogPosts.createdAt,
        updatedAt: blogPosts.updatedAt,
      })
      .from(blogPosts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(blogPosts.createdAt));

    const categories = await db.select().from(blogCategories).orderBy(blogCategories.name);

    res.json({ posts, categories });
  } catch (error: any) {
    console.error('Fetch admin news error:', error);
    res.status(500).json({ error: 'Failed to retrieve blog posts' });
  }
});

// POST /api/public-portal/admin/news - Create new blog post
publicPortalRouter.post('/admin/news', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, slug, summary, content, category, categoryId, featuredImage, status, isFeatured, authorName } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Post title is required' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    let finalSlug = slug ? slugify(slug) : slugify(title);
    if (!finalSlug) finalSlug = `post-${Date.now()}`;

    // Verify slug uniqueness
    const [existingSlug] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, finalSlug)).limit(1);
    if (existingSlug) {
      finalSlug = `${finalSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Server-side HTML sanitization prevents stored XSS
    const cleanContent = sanitizeHtml(content);
    const postStatus = ['draft', 'published', 'archived'].includes(status) ? status : 'published';
    const publishedAt = postStatus === 'published' ? new Date() : null;

    const [post] = await db
      .insert(blogPosts)
      .values({
        title: title.trim(),
        slug: finalSlug,
        summary: summary ? summary.trim() : null,
        content: cleanContent,
        category: category ? category.trim() : 'Admissions',
        categoryId: categoryId ? parseInt(categoryId, 10) : null,
        featuredImage: featuredImage ? featuredImage.trim() : null,
        authorName: authorName ? authorName.trim() : req.user!.fullName || 'Admissions Committee',
        authorId: req.user!.id,
        status: postStatus,
        publishedAt,
        isFeatured: Boolean(isFeatured),
      })
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'BLOG_POST_CREATED',
      resource: 'blog_posts',
      resourceId: post.id.toString(),
      details: { title: post.title, slug: post.slug, status: post.status },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: 'Article created successfully', post });
  } catch (error: any) {
    console.error('Create blog post error:', error);
    res.status(500).json({ error: 'Failed to create blog post' });
  }
});

// PUT /api/public-portal/admin/news/:id - Update blog post
publicPortalRouter.put('/admin/news/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const { title, slug, summary, content, category, categoryId, featuredImage, status, isFeatured, authorName } = req.body;

    const [existing] = await db.select().from(blogPosts).where(eq(blogPosts.id, postId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Post record not found' });
    }

    let finalSlug = slug ? slugify(slug) : existing.slug;
    if (finalSlug !== existing.slug) {
      const [duplicate] = await db
        .select({ id: blogPosts.id })
        .from(blogPosts)
        .where(and(eq(blogPosts.slug, finalSlug), sql`${blogPosts.id} != ${postId}`))
        .limit(1);
      if (duplicate) {
        return res.status(400).json({ error: `An article with slug "${finalSlug}" already exists.` });
      }
    }

    const cleanContent = content !== undefined ? sanitizeHtml(content) : existing.content;
    const postStatus = status && ['draft', 'published', 'archived'].includes(status) ? status : existing.status;
    let publishedAt = existing.publishedAt;
    if (postStatus === 'published' && !publishedAt) {
      publishedAt = new Date();
    }

    const [updated] = await db
      .update(blogPosts)
      .set({
        title: title !== undefined ? title.trim() : existing.title,
        slug: finalSlug,
        summary: summary !== undefined ? (summary ? summary.trim() : null) : existing.summary,
        content: cleanContent,
        category: category !== undefined ? category.trim() : existing.category,
        categoryId: categoryId !== undefined ? (categoryId ? parseInt(categoryId, 10) : null) : existing.categoryId,
        featuredImage: featuredImage !== undefined ? (featuredImage ? featuredImage.trim() : null) : existing.featuredImage,
        authorName: authorName !== undefined ? authorName.trim() : existing.authorName,
        status: postStatus,
        publishedAt,
        isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : existing.isFeatured,
        updatedAt: new Date(),
      })
      .where(eq(blogPosts.id, postId))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'BLOG_POST_UPDATED',
      resource: 'blog_posts',
      resourceId: postId.toString(),
      details: { title: updated.title, slug: updated.slug, status: updated.status },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Article updated successfully', post: updated });
  } catch (error: any) {
    console.error('Update blog post error:', error);
    res.status(500).json({ error: 'Failed to update blog post' });
  }
});

// DELETE /api/public-portal/admin/news/:id - Delete blog post
publicPortalRouter.delete('/admin/news/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const [existing] = await db.select().from(blogPosts).where(eq(blogPosts.id, postId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Post record not found' });
    }

    await db.delete(blogPosts).where(eq(blogPosts.id, postId));

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'BLOG_POST_DELETED',
      resource: 'blog_posts',
      resourceId: postId.toString(),
      details: { title: existing.title, slug: existing.slug },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Article deleted successfully' });
  } catch (error: any) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete blog post' });
  }
});

// ============================================================================
// Important Dates Management
// ============================================================================

// GET /api/public-portal/admin/dates - List all important dates
publicPortalRouter.get('/admin/dates', requireAuth, requirePortalAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const list = await db.select().from(importantDates).orderBy(asc(importantDates.displayOrder), asc(importantDates.eventDate));
    res.json({ dates: list });
  } catch (error: any) {
    console.error('Fetch admin dates error:', error);
    res.status(500).json({ error: 'Failed to retrieve important dates' });
  }
});

// POST /api/public-portal/admin/dates - Create important date
publicPortalRouter.post('/admin/dates', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, eventDate, eventTime, category, isPubliclyVisible, status, displayOrder } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Date title is required' });
    }
    if (!eventDate || !eventDate.trim()) {
      return res.status(400).json({ error: 'Event date (YYYY-MM-DD) is required' });
    }

    const [item] = await db
      .insert(importantDates)
      .values({
        title: title.trim(),
        description: description ? description.trim() : null,
        eventDate: eventDate.trim(),
        eventTime: eventTime ? eventTime.trim() : null,
        category: category ? category.trim() : 'Admission',
        isPubliclyVisible: isPubliclyVisible !== undefined ? Boolean(isPubliclyVisible) : true,
        status: status || 'upcoming',
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder, 10) : 0,
      })
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'IMPORTANT_DATE_CREATED',
      resource: 'important_dates',
      resourceId: item.id.toString(),
      details: { title: item.title, eventDate: item.eventDate },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: 'Important date created successfully', date: item });
  } catch (error: any) {
    console.error('Create date error:', error);
    res.status(500).json({ error: 'Failed to create important date' });
  }
});

// PUT /api/public-portal/admin/dates/:id - Update important date
publicPortalRouter.put('/admin/dates/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const dateId = parseInt(req.params.id, 10);
    const { title, description, eventDate, eventTime, category, isPubliclyVisible, status, displayOrder } = req.body;

    const [existing] = await db.select().from(importantDates).where(eq(importantDates.id, dateId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Date entry not found' });
    }

    const [updated] = await db
      .update(importantDates)
      .set({
        title: title !== undefined ? title.trim() : existing.title,
        description: description !== undefined ? (description ? description.trim() : null) : existing.description,
        eventDate: eventDate !== undefined ? eventDate.trim() : existing.eventDate,
        eventTime: eventTime !== undefined ? (eventTime ? eventTime.trim() : null) : existing.eventTime,
        category: category !== undefined ? category.trim() : existing.category,
        isPubliclyVisible: isPubliclyVisible !== undefined ? Boolean(isPubliclyVisible) : existing.isPubliclyVisible,
        status: status !== undefined ? status : existing.status,
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder, 10) : existing.displayOrder,
        updatedAt: new Date(),
      })
      .where(eq(importantDates.id, dateId))
      .returning();

    res.json({ success: true, message: 'Date entry updated successfully', date: updated });
  } catch (error: any) {
    console.error('Update date error:', error);
    res.status(500).json({ error: 'Failed to update important date' });
  }
});

// DELETE /api/public-portal/admin/dates/:id - Delete important date
publicPortalRouter.delete('/admin/dates/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const dateId = parseInt(req.params.id, 10);
    await db.delete(importantDates).where(eq(importantDates.id, dateId));
    res.json({ success: true, message: 'Important date deleted successfully' });
  } catch (error: any) {
    console.error('Delete date error:', error);
    res.status(500).json({ error: 'Failed to delete important date' });
  }
});

// ============================================================================
// Admission Requirements Management
// ============================================================================

// GET /api/public-portal/admin/requirements - List all admission requirements
publicPortalRouter.get('/admin/requirements', requireAuth, requirePortalAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const list = await db
      .select({
        id: admissionRequirements.id,
        title: admissionRequirements.title,
        description: admissionRequirements.description,
        scope: admissionRequirements.scope,
        departmentId: admissionRequirements.departmentId,
        departmentName: departments.name,
        classId: admissionRequirements.classId,
        className: classes.name,
        isMandatory: admissionRequirements.isMandatory,
        isPubliclyVisible: admissionRequirements.isPubliclyVisible,
        displayOrder: admissionRequirements.displayOrder,
      })
      .from(admissionRequirements)
      .leftJoin(departments, eq(admissionRequirements.departmentId, departments.id))
      .leftJoin(classes, eq(admissionRequirements.classId, classes.id))
      .orderBy(asc(admissionRequirements.displayOrder), asc(admissionRequirements.id));

    const depts = await db.select().from(departments).where(eq(departments.status, 'active'));
    const allClasses = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.status, 'active'));

    res.json({ requirements: list, departments: depts, classes: allClasses });
  } catch (error: any) {
    console.error('Fetch admin requirements error:', error);
    res.status(500).json({ error: 'Failed to retrieve admission requirements' });
  }
});

// POST /api/public-portal/admin/requirements - Create admission requirement
publicPortalRouter.post('/admin/requirements', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, scope, departmentId, classId, isMandatory, isPubliclyVisible, displayOrder } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Requirement title is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Requirement description is required' });
    }

    const [item] = await db
      .insert(admissionRequirements)
      .values({
        title: title.trim(),
        description: description.trim(),
        scope: ['general', 'department', 'class'].includes(scope) ? scope : 'general',
        departmentId: departmentId ? parseInt(departmentId, 10) : null,
        classId: classId ? parseInt(classId, 10) : null,
        isMandatory: isMandatory !== undefined ? Boolean(isMandatory) : true,
        isPubliclyVisible: isPubliclyVisible !== undefined ? Boolean(isPubliclyVisible) : true,
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder, 10) : 0,
      })
      .returning();

    res.status(201).json({ success: true, message: 'Admission requirement created successfully', requirement: item });
  } catch (error: any) {
    console.error('Create requirement error:', error);
    res.status(500).json({ error: 'Failed to create admission requirement' });
  }
});

// PUT /api/public-portal/admin/requirements/:id - Update requirement
publicPortalRouter.put('/admin/requirements/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const reqId = parseInt(req.params.id, 10);
    const { title, description, scope, departmentId, classId, isMandatory, isPubliclyVisible, displayOrder } = req.body;

    const [existing] = await db.select().from(admissionRequirements).where(eq(admissionRequirements.id, reqId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Requirement entry not found' });
    }

    const [updated] = await db
      .update(admissionRequirements)
      .set({
        title: title !== undefined ? title.trim() : existing.title,
        description: description !== undefined ? description.trim() : existing.description,
        scope: scope !== undefined ? scope : existing.scope,
        departmentId: departmentId !== undefined ? (departmentId ? parseInt(departmentId, 10) : null) : existing.departmentId,
        classId: classId !== undefined ? (classId ? parseInt(classId, 10) : null) : existing.classId,
        isMandatory: isMandatory !== undefined ? Boolean(isMandatory) : existing.isMandatory,
        isPubliclyVisible: isPubliclyVisible !== undefined ? Boolean(isPubliclyVisible) : existing.isPubliclyVisible,
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder, 10) : existing.displayOrder,
        updatedAt: new Date(),
      })
      .where(eq(admissionRequirements.id, reqId))
      .returning();

    res.json({ success: true, message: 'Requirement updated successfully', requirement: updated });
  } catch (error: any) {
    console.error('Update requirement error:', error);
    res.status(500).json({ error: 'Failed to update admission requirement' });
  }
});

// DELETE /api/public-portal/admin/requirements/:id - Delete requirement
publicPortalRouter.delete('/admin/requirements/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const reqId = parseInt(req.params.id, 10);
    await db.delete(admissionRequirements).where(eq(admissionRequirements.id, reqId));
    res.json({ success: true, message: 'Requirement deleted successfully' });
  } catch (error: any) {
    console.error('Delete requirement error:', error);
    res.status(500).json({ error: 'Failed to delete requirement' });
  }
});

// ============================================================================
// FAQs Management
// ============================================================================

// GET /api/public-portal/admin/faqs - List all FAQs
publicPortalRouter.get('/admin/faqs', requireAuth, requirePortalAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const list = await db.select().from(faqs).orderBy(asc(faqs.displayOrder), asc(faqs.id));
    res.json({ faqs: list });
  } catch (error: any) {
    console.error('Fetch admin faqs error:', error);
    res.status(500).json({ error: 'Failed to retrieve FAQs' });
  }
});

// POST /api/public-portal/admin/faqs - Create FAQ
publicPortalRouter.post('/admin/faqs', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { question, answer, category, displayOrder, isPublished } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'FAQ question is required' });
    }
    if (!answer || !answer.trim()) {
      return res.status(400).json({ error: 'FAQ answer is required' });
    }

    const cleanAnswer = sanitizeHtml(answer);

    const [item] = await db
      .insert(faqs)
      .values({
        question: question.trim(),
        answer: cleanAnswer,
        category: category ? category.trim() : 'General',
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder, 10) : 0,
        isPublished: isPublished !== undefined ? Boolean(isPublished) : true,
      })
      .returning();

    res.status(201).json({ success: true, message: 'FAQ created successfully', faq: item });
  } catch (error: any) {
    console.error('Create faq error:', error);
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
});

// PUT /api/public-portal/admin/faqs/:id - Update FAQ
publicPortalRouter.put('/admin/faqs/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const faqId = parseInt(req.params.id, 10);
    const { question, answer, category, displayOrder, isPublished } = req.body;

    const [existing] = await db.select().from(faqs).where(eq(faqs.id, faqId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'FAQ record not found' });
    }

    const cleanAnswer = answer !== undefined ? sanitizeHtml(answer) : existing.answer;

    const [updated] = await db
      .update(faqs)
      .set({
        question: question !== undefined ? question.trim() : existing.question,
        answer: cleanAnswer,
        category: category !== undefined ? category.trim() : existing.category,
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder, 10) : existing.displayOrder,
        isPublished: isPublished !== undefined ? Boolean(isPublished) : existing.isPublished,
        updatedAt: new Date(),
      })
      .where(eq(faqs.id, faqId))
      .returning();

    res.json({ success: true, message: 'FAQ updated successfully', faq: updated });
  } catch (error: any) {
    console.error('Update faq error:', error);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
});

// DELETE /api/public-portal/admin/faqs/:id - Delete FAQ
publicPortalRouter.delete('/admin/faqs/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const faqId = parseInt(req.params.id, 10);
    await db.delete(faqs).where(eq(faqs.id, faqId));
    res.json({ success: true, message: 'FAQ deleted successfully' });
  } catch (error: any) {
    console.error('Delete faq error:', error);
    res.status(500).json({ error: 'Failed to delete FAQ' });
  }
});

// ============================================================================
// VISUAL ADMISSIONS EDITOR & HERO SLIDES MANAGEMENT (super_admin only)
// ============================================================================

// GET /api/public-portal/admin/editor-content - Full structured payload for Visual Editor
publicPortalRouter.get('/admin/editor-content', requireAuth, requirePortalAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const [
      portalSetting,
      schoolSettingList,
      allHeroSlides,
      allClassesList,
      allPosts,
      allDates,
      allRequirements,
      allFaqs,
      allDepts,
      allSessions,
    ] = await Promise.all([
      getOrCreatePortalSettings(),
      db.select().from(schoolSettings).limit(1),
      db.select().from(publicPortalHeroSlides).orderBy(asc(publicPortalHeroSlides.displayOrder), asc(publicPortalHeroSlides.id)),
      db
        .select({
          id: classes.id,
          name: classes.name,
          section: classes.section,
          gradeLevel: classes.gradeLevel,
          sessionId: classes.sessionId,
          departmentId: classes.departmentId,
          departmentName: departments.name,
          capacity: classes.capacity,
          duration: classes.duration,
          publicDescription: classes.publicDescription,
          requirements: classes.requirements,
          admissionStatus: classes.admissionStatus,
          isFeatured: classes.isFeatured,
          isPubliclyVisible: classes.isPubliclyVisible,
          status: classes.status,
        })
        .from(classes)
        .leftJoin(departments, eq(classes.departmentId, departments.id))
        .where(eq(classes.status, 'active'))
        .orderBy(desc(classes.isFeatured), asc(classes.name)),
      db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt)),
      db.select().from(importantDates).orderBy(asc(importantDates.displayOrder), asc(importantDates.eventDate)),
      db.select().from(admissionRequirements).orderBy(asc(admissionRequirements.displayOrder), asc(admissionRequirements.id)),
      db.select().from(faqs).orderBy(asc(faqs.displayOrder), asc(faqs.id)),
      db.select().from(departments).where(eq(departments.status, 'active')).orderBy(departments.name),
      db.select().from(academicSessions).where(inArray(academicSessions.status, ['active', 'upcoming'])).orderBy(desc(academicSessions.isCurrent)),
    ]);

    let parsedDraft = null;
    if (portalSetting.draftSettings) {
      try {
        parsedDraft = JSON.parse(portalSetting.draftSettings);
      } catch (e) {
        parsedDraft = null;
      }
    }

    const schoolSetting = schoolSettingList[0] || {};

    res.json({
      liveSettings: portalSetting,
      draftSettings: parsedDraft,
      hasUnpublishedChanges: portalSetting.hasUnpublishedChanges,
      heroSlides: allHeroSlides,
      programs: allClassesList,
      news: allPosts,
      dates: allDates,
      requirements: allRequirements,
      faqs: allFaqs,
      departments: allDepts,
      sessions: allSessions,
      schoolSettings: schoolSetting,
    });
  } catch (error: any) {
    console.error('Fetch editor content error:', error);
    res.status(500).json({ error: 'Failed to retrieve visual editor content' });
  }
});

// PUT /api/public-portal/admin/save-draft - Save draft settings in Visual Editor
publicPortalRouter.put('/admin/save-draft', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await getOrCreatePortalSettings();
    const draftPayload = req.body;

    if (!draftPayload || typeof draftPayload !== 'object') {
      return res.status(400).json({ error: 'Invalid draft payload' });
    }

    const draftString = JSON.stringify(draftPayload);

    const [updated] = await db
      .update(publicPortalSettings)
      .set({
        draftSettings: draftString,
        hasUnpublishedChanges: true,
        updatedAt: new Date(),
      })
      .where(eq(publicPortalSettings.id, existing.id))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'PUBLIC_PORTAL_DRAFT_SAVED',
      resource: 'public_portal_settings',
      resourceId: existing.id.toString(),
      details: { updatedKeys: Object.keys(draftPayload) },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Draft settings saved successfully.',
      hasUnpublishedChanges: true,
      draftSettings: draftPayload,
    });
  } catch (error: any) {
    console.error('Save draft error:', error);
    res.status(500).json({ error: 'Failed to save draft settings' });
  }
});

// POST /api/public-portal/admin/publish - Publish draft changes atomically to live public portal
publicPortalRouter.post('/admin/publish', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await getOrCreatePortalSettings();
    let payload = req.body;

    if (!payload || Object.keys(payload).length === 0) {
      if (existing.draftSettings) {
        try {
          payload = JSON.parse(existing.draftSettings);
        } catch (e) {
          payload = {};
        }
      } else {
        payload = {};
      }
    }

    const {
      portalEnabled,
      admissionsOpen,
      openingDate,
      closingDate,
      currentSessionId,
      announcementMessage,
      applicationInstructions,
      applicationFee,
      admissionsContactInfo,
      showPrograms,
      showRequirements,
      showImportantDates,
      showNews,
      showFaqs,
      showContact,
      heroTitle,
      heroSubtitle,
      heroBadgeText,
      heroPrimaryCtaText,
      heroSecondaryCtaText,
      websiteUrl,
      facebookUrl,
      twitterUrl,
      instagramUrl,
      linkedinUrl,
      officeHours,
    } = payload;

    const [published] = await db
      .update(publicPortalSettings)
      .set({
        portalEnabled: portalEnabled !== undefined ? Boolean(portalEnabled) : existing.portalEnabled,
        admissionsOpen: admissionsOpen !== undefined ? Boolean(admissionsOpen) : existing.admissionsOpen,
        openingDate: openingDate !== undefined ? (openingDate ? String(openingDate).trim() : null) : existing.openingDate,
        closingDate: closingDate !== undefined ? (closingDate ? String(closingDate).trim() : null) : existing.closingDate,
        currentSessionId: currentSessionId ? parseInt(currentSessionId, 10) : existing.currentSessionId,
        announcementMessage: announcementMessage !== undefined ? String(announcementMessage).trim() : existing.announcementMessage,
        applicationInstructions: applicationInstructions !== undefined ? String(applicationInstructions).trim() : existing.applicationInstructions,
        applicationFee: applicationFee !== undefined ? String(applicationFee).trim() : existing.applicationFee,
        admissionsContactInfo: admissionsContactInfo !== undefined ? String(admissionsContactInfo).trim() : existing.admissionsContactInfo,
        showPrograms: showPrograms !== undefined ? Boolean(showPrograms) : existing.showPrograms,
        showRequirements: showRequirements !== undefined ? Boolean(showRequirements) : existing.showRequirements,
        showImportantDates: showImportantDates !== undefined ? Boolean(showImportantDates) : existing.showImportantDates,
        showNews: showNews !== undefined ? Boolean(showNews) : existing.showNews,
        showFaqs: showFaqs !== undefined ? Boolean(showFaqs) : existing.showFaqs,
        showContact: showContact !== undefined ? Boolean(showContact) : existing.showContact,
        heroTitle: heroTitle !== undefined ? String(heroTitle).trim() : existing.heroTitle,
        heroSubtitle: heroSubtitle !== undefined ? String(heroSubtitle).trim() : existing.heroSubtitle,
        heroBadgeText: heroBadgeText !== undefined ? String(heroBadgeText).trim() : existing.heroBadgeText,
        heroPrimaryCtaText: heroPrimaryCtaText !== undefined ? String(heroPrimaryCtaText).trim() : existing.heroPrimaryCtaText,
        heroSecondaryCtaText: heroSecondaryCtaText !== undefined ? String(heroSecondaryCtaText).trim() : existing.heroSecondaryCtaText,
        websiteUrl: websiteUrl !== undefined ? (websiteUrl ? String(websiteUrl).trim() : null) : existing.websiteUrl,
        facebookUrl: facebookUrl !== undefined ? (facebookUrl ? String(facebookUrl).trim() : null) : existing.facebookUrl,
        twitterUrl: twitterUrl !== undefined ? (twitterUrl ? String(twitterUrl).trim() : null) : existing.twitterUrl,
        instagramUrl: instagramUrl !== undefined ? (instagramUrl ? String(instagramUrl).trim() : null) : existing.instagramUrl,
        linkedinUrl: linkedinUrl !== undefined ? (linkedinUrl ? String(linkedinUrl).trim() : null) : existing.linkedinUrl,
        officeHours: officeHours !== undefined ? (officeHours ? String(officeHours).trim() : null) : existing.officeHours,
        draftSettings: null,
        hasUnpublishedChanges: false,
        updatedAt: new Date(),
      })
      .where(eq(publicPortalSettings.id, existing.id))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'ADMISSIONS_PAGE_PUBLISHED',
      resource: 'public_portal_settings',
      resourceId: existing.id.toString(),
      details: { heroTitle: published.heroTitle, heroBadgeText: published.heroBadgeText },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Admissions page published live successfully!',
      publishedSettings: published,
      hasUnpublishedChanges: false,
    });
  } catch (error: any) {
    console.error('Publish portal settings error:', error);
    res.status(500).json({ error: 'Failed to publish admissions page changes' });
  }
});

// POST /api/public-portal/admin/discard-draft - Discard pending draft changes
publicPortalRouter.post('/admin/discard-draft', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await getOrCreatePortalSettings();

    const [updated] = await db
      .update(publicPortalSettings)
      .set({
        draftSettings: null,
        hasUnpublishedChanges: false,
        updatedAt: new Date(),
      })
      .where(eq(publicPortalSettings.id, existing.id))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'PUBLIC_PORTAL_DRAFT_DISCARDED',
      resource: 'public_portal_settings',
      resourceId: existing.id.toString(),
      details: {},
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Draft changes discarded. Reset to live published settings.',
      liveSettings: updated,
    });
  } catch (error: any) {
    console.error('Discard draft error:', error);
    res.status(500).json({ error: 'Failed to discard draft changes' });
  }
});

// ============================================================================
// Hero Slides Endpoints
// ============================================================================

// GET /api/public-portal/admin/hero-slides - List all slides
publicPortalRouter.get('/admin/hero-slides', requireAuth, requirePortalAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const slides = await db
      .select()
      .from(publicPortalHeroSlides)
      .orderBy(asc(publicPortalHeroSlides.displayOrder), asc(publicPortalHeroSlides.id));
    res.json({ slides });
  } catch (error: any) {
    console.error('Fetch hero slides error:', error);
    res.status(500).json({ error: 'Failed to retrieve hero slides' });
  }
});

// GET /api/public-portal/hero-image/:fileId - Public streaming of hero background assets
publicPortalRouter.get('/hero-image/:fileId', async (req, res: Response) => {
  try {
    const fileId = req.params.fileId;
    if (!fileId || !/^[a-zA-Z0-9_-]{8,64}$/.test(fileId)) {
      return res.status(400).json({ error: 'Invalid image identifier' });
    }

    const stored = await StorageService.getFile(fileId, true);
    if (!stored) {
      return res.status(404).json({ error: 'Hero image not found' });
    }

    res.setHeader('Content-Type', stored.metadata.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Content-Length', stored.buffer.length);
    return res.end(stored.buffer);
  } catch (error: any) {
    console.error('Hero image streaming error:', error);
    return res.status(500).json({ error: 'Failed to retrieve image' });
  }
});

// POST /api/public-portal/admin/hero-slides - Add new hero slide
publicPortalRouter.post('/admin/hero-slides', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { imageUrl, title, altText, isActive, displayOrder } = req.body;

    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      return res.status(400).json({ error: 'Hero image URL or image data is required' });
    }

    // Server-side safe format validation & secure storage
    const trimmedUrl = imageUrl.trim();
    let finalImageUrl = trimmedUrl;

    if (trimmedUrl.startsWith('data:')) {
      const allowedDataPrefixes = ['data:image/jpeg;', 'data:image/png;', 'data:image/webp;', 'data:image/jpg;'];
      const isValidImage = allowedDataPrefixes.some((p) => trimmedUrl.toLowerCase().startsWith(p));
      if (!isValidImage) {
        return res.status(400).json({ error: 'Only safe image formats (JPEG, PNG, WebP) are allowed for hero slides' });
      }
      if (trimmedUrl.length > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'Hero image file exceeds maximum allowed size (10MB)' });
      }
      // Store to secure storage instead of base64 in Postgres
      const saved = await StorageService.saveFile({
        dataUriOrBuffer: trimmedUrl,
        category: 'hero_image',
        isPublic: true,
      });
      finalImageUrl = `/api/public-portal/hero-image/${saved.fileId}`;
    } else if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
      const safeExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
      const urlLower = trimmedUrl.toLowerCase().split('?')[0];
      const hasSafeExt = safeExtensions.some((ext) => urlLower.endsWith(ext));
      if (!hasSafeExt) {
        return res.status(400).json({ error: 'Hero image URL must point to a safe image file (.jpg, .png, .webp, .svg)' });
      }
    } else if (!trimmedUrl.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid hero image path or URL' });
    }

    const [slide] = await db
      .insert(publicPortalHeroSlides)
      .values({
        imageUrl: finalImageUrl,
        title: title ? title.trim() : null,
        altText: altText ? altText.trim() : 'Campus Hero Background',
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder, 10) : 0,
      })
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'HERO_IMAGE_ADDED',
      resource: 'public_portal_hero_slides',
      resourceId: slide.id.toString(),
      details: { title: slide.title, altText: slide.altText },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, message: 'Hero slide created successfully', slide });
  } catch (error: any) {
    console.error('Create hero slide error:', error);
    res.status(500).json({ error: 'Failed to add hero slide' });
  }
});

// PUT /api/public-portal/admin/hero-slides/:id - Update hero slide
publicPortalRouter.put('/admin/hero-slides/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const slideId = parseInt(req.params.id, 10);
    const { imageUrl, title, altText, isActive, displayOrder } = req.body;

    const [existing] = await db.select().from(publicPortalHeroSlides).where(eq(publicPortalHeroSlides.id, slideId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Hero slide not found' });
    }

    let finalImageUrl = existing.imageUrl;
    if (imageUrl !== undefined) {
      const trimmed = imageUrl.trim();
      if (trimmed.startsWith('data:')) {
        const saved = await StorageService.saveFile({
          dataUriOrBuffer: trimmed,
          category: 'hero_image',
          isPublic: true,
        });
        finalImageUrl = `/api/public-portal/hero-image/${saved.fileId}`;
      } else {
        finalImageUrl = trimmed;
      }
    }

    const [updated] = await db
      .update(publicPortalHeroSlides)
      .set({
        imageUrl: finalImageUrl,
        title: title !== undefined ? (title ? title.trim() : null) : existing.title,
        altText: altText !== undefined ? (altText ? altText.trim() : 'Campus Hero Background') : existing.altText,
        isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder, 10) : existing.displayOrder,
        updatedAt: new Date(),
      })
      .where(eq(publicPortalHeroSlides.id, slideId))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'HERO_SLIDE_UPDATED',
      resource: 'public_portal_hero_slides',
      resourceId: slideId.toString(),
      details: { isActive: updated.isActive, title: updated.title },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Hero slide updated successfully', slide: updated });
  } catch (error: any) {
    console.error('Update hero slide error:', error);
    res.status(500).json({ error: 'Failed to update hero slide' });
  }
});

// DELETE /api/public-portal/admin/hero-slides/:id - Delete hero slide
publicPortalRouter.delete('/admin/hero-slides/:id', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const slideId = parseInt(req.params.id, 10);
    const [existing] = await db.select().from(publicPortalHeroSlides).where(eq(publicPortalHeroSlides.id, slideId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Hero slide not found' });
    }

    await db.delete(publicPortalHeroSlides).where(eq(publicPortalHeroSlides.id, slideId));

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'HERO_IMAGE_REMOVED',
      resource: 'public_portal_hero_slides',
      resourceId: slideId.toString(),
      details: { imageUrl: existing.imageUrl },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Hero slide removed successfully' });
  } catch (error: any) {
    console.error('Delete hero slide error:', error);
    res.status(500).json({ error: 'Failed to delete hero slide' });
  }
});

// PUT /api/public-portal/admin/hero-slides-reorder - Reorder hero slides list
publicPortalRouter.put('/admin/hero-slides-reorder', requireAuth, requirePortalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { order } = req.body; // array of slide IDs [{ id: 1, displayOrder: 0 }, { id: 2, displayOrder: 1 }]
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order array is required' });
    }

    for (const item of order) {
      if (item.id && typeof item.displayOrder === 'number') {
        await db
          .update(publicPortalHeroSlides)
          .set({ displayOrder: item.displayOrder, updatedAt: new Date() })
          .where(eq(publicPortalHeroSlides.id, parseInt(item.id, 10)));
      }
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'HERO_IMAGE_REORDERED',
      resource: 'public_portal_hero_slides',
      resourceId: 'multiple',
      details: { count: order.length },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Hero slides reordered successfully' });
  } catch (error: any) {
    console.error('Reorder hero slides error:', error);
    res.status(500).json({ error: 'Failed to reorder hero slides' });
  }
});
