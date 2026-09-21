import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';

/**
 * "Trợ giúp" (Phase 15): a plain-language, step-by-step guide for older, less computer-confident
 * teachers (and a short one for students), reachable from the header on every page.
 *
 * The copy lives in the `help` i18n namespace. Every on-screen button/tab/field a step names is
 * NOT typed into that copy: the sentence has a `{{placeholder}}` and the step lists the real i18n
 * key of the label (`labels` below), so when a label is renamed elsewhere the guide follows it
 * automatically. Each label is rendered in a `<b data-help-label>` chip so it is easy to spot on
 * the page (and easy for a script to extract and check against the UI strings).
 *
 * Public route (works logged out too): teachers/admins see the teacher guide, students the
 * student guide; a visitor who is not logged in gets the teacher guide with a link to switch.
 */

/** A label a step names: the i18n key of the real UI string (optionally with interpolation values). */
type LabelSpec = string | { key: string; values: Record<string, string | number> };

interface StepDef {
  key: string;
  labels?: Record<string, LabelSpec>;
}

interface GroupDef {
  titleKey?: string;
  steps: StepDef[];
}

interface NoteDef extends StepDef {
  tone: 'tip' | 'warning';
}

interface SectionDef {
  id: string;
  titleKey: string;
  introKey?: string;
  groups: GroupDef[];
  notes?: NoteDef[];
}

interface GlossaryDef {
  /** Where the term comes from: an existing UI label (kept live) or the help copy itself. */
  termKey: string;
  definitionKey: string;
  definitionLabels?: Record<string, LabelSpec>;
}

const step = (key: string, labels?: Record<string, LabelSpec>): StepDef => ({ key, labels });
const note = (tone: NoteDef['tone'], key: string, labels?: Record<string, LabelSpec>): NoteDef => ({
  tone,
  key,
  labels,
});

const TEACHER_SECTIONS: SectionDef[] = [
  {
    id: 'first',
    titleKey: 'help.teacher.first.title',
    introKey: 'help.teacher.first.intro',
    groups: [
      {
        steps: [
          step('help.teacher.first.s1'),
          step('help.teacher.first.s2', { login: 'header.logIn' }),
          step('help.teacher.first.s3', {
            email: 'auth.email',
            password: 'auth.password',
            submit: 'auth.login.submit',
          }),
          step('help.teacher.first.s4', { classes: 'teacherNav.classes' }),
          step('help.teacher.first.s5', { textSize: 'header.textSize.toLarge' }),
          step('help.teacher.first.s6', { help: 'header.help' }),
        ],
      },
    ],
    notes: [note('tip', 'help.teacher.first.note')],
  },
  {
    id: 'classes',
    titleKey: 'help.teacher.classes.title',
    introKey: 'help.teacher.classes.intro',
    groups: [
      {
        titleKey: 'help.teacher.classes.createTitle',
        steps: [
          step('help.teacher.classes.c1', { classes: 'teacherNav.classes' }),
          step('help.teacher.classes.c2', { create: 'teacherHome.createButton' }),
          step('help.teacher.classes.c3', { name: 'teacherHome.nameLabel' }),
          step('help.teacher.classes.c4', { semester: 'teacherHome.semesterLabel' }),
          step('help.teacher.classes.c5', { submit: 'teacherHome.createSubmit' }),
        ],
      },
      {
        titleKey: 'help.teacher.classes.addTitle',
        steps: [
          step('help.teacher.classes.a1'),
          step('help.teacher.classes.a2', { students: 'classWorkspace.tabs.students' }),
          step('help.teacher.classes.a3', { add: 'classRoster.addButton' }),
          step('help.teacher.classes.a4', {
            one: 'classRoster.modeForm',
            submit: 'classRoster.form.submit',
          }),
          step('help.teacher.classes.a5', {
            excel: 'classRoster.modeExcel',
            template: 'classRoster.excel.downloadTemplate',
            choose: 'classRoster.excel.fileLabel',
            confirm: { key: 'classRoster.excel.confirm', values: { valid: '…' } },
          }),
        ],
      },
      {
        titleKey: 'help.teacher.classes.passwordTitle',
        steps: [
          step('help.teacher.classes.p1'),
          step('help.teacher.classes.p2', { download: 'classRoster.result.download' }),
          step('help.teacher.classes.p3'),
        ],
      },
      {
        titleKey: 'help.teacher.classes.forgotTitle',
        steps: [
          step('help.teacher.classes.f1', { students: 'classWorkspace.tabs.students' }),
          step('help.teacher.classes.f2', { reset: 'classResetPassword.button' }),
          step('help.teacher.classes.f3', { confirm: 'classResetPassword.confirm' }),
          step('help.teacher.classes.f4', { copy: 'classResetPassword.copy' }),
        ],
      },
    ],
    notes: [note('warning', 'help.teacher.classes.note')],
  },
  {
    id: 'author',
    titleKey: 'help.teacher.author.title',
    introKey: 'help.teacher.author.intro',
    groups: [
      {
        titleKey: 'help.teacher.author.createTitle',
        steps: [
          step('help.teacher.author.c1', { library: 'teacherNav.library' }),
          step('help.teacher.author.c2', { tests: 'teacherLibrary.tests.title', open: 'teacherLibrary.open' }),
          step('help.teacher.author.c3', { title: 'teacherTests.newTestTitleLabel' }),
          step('help.teacher.author.c4', { create: 'teacherTests.createButton' }),
        ],
      },
      {
        titleKey: 'help.teacher.author.questionsTitle',
        steps: [
          step('help.teacher.author.q1', {
            sectionName: 'teacherTestEditor.sections.newSectionTitleLabel',
            addSection: 'teacherTestEditor.sections.addSection',
          }),
          step('help.teacher.author.q2', {
            multipleChoice: 'teacherTestEditor.sections.addMultipleChoice',
            essay: 'teacherTestEditor.sections.addEssay',
          }),
          step('help.teacher.author.q3'),
          step('help.teacher.author.q4', { saved: { key: 'editorSave.savedAt', values: { time: '…' } } }),
        ],
      },
      {
        titleKey: 'help.teacher.author.finishTitle',
        steps: [
          step('help.teacher.author.f1', { preview: 'teacherTestEditor.nextStep.preview' }),
          step('help.teacher.author.f2', { assign: 'teacherTestEditor.nextStep.assign' }),
        ],
      },
    ],
    notes: [note('tip', 'help.teacher.author.note', { variants: 'teacherTestEditor.variants.heading' })],
  },
  {
    id: 'assign',
    titleKey: 'help.teacher.assign.title',
    introKey: 'help.teacher.assign.intro',
    groups: [
      {
        steps: [
          step('help.teacher.assign.s1', { classes: 'teacherNav.classes' }),
          step('help.teacher.assign.s2', { assignments: 'classWorkspace.tabs.assignments' }),
          step('help.teacher.assign.s3', { assignNew: 'classAssignments.assignNew' }),
          step('help.teacher.assign.s4'),
          step('help.teacher.assign.s5', { deadline: 'assignDialog.scheduleToggle' }),
          step('help.teacher.assign.s6', {
            week: 'assignDialog.quickClose.week1',
            closeAt: 'assignDialog.closeAtLabel',
          }),
          step('help.teacher.assign.s7', {
            confirm: { key: 'assignDialog.confirm', values: { count: 1 } },
          }),
        ],
      },
    ],
    notes: [
      note('tip', 'help.teacher.assign.noteDeadline', { schedule: 'classAssignments.actions.schedule' }),
      note('warning', 'help.teacher.assign.noteSemester', { semester: 'classWorkspace.semesterLabel' }),
    ],
  },
  {
    id: 'grading',
    titleKey: 'help.teacher.grading.title',
    introKey: 'help.teacher.grading.intro',
    groups: [
      {
        steps: [
          step('help.teacher.grading.s1', { overview: 'classWorkspace.tabs.overview' }),
          step('help.teacher.grading.s2', { needsGrading: 'classOverview.needsGrading.heading' }),
          step('help.teacher.grading.s3', { grade: 'classOverview.needsGrading.grade' }),
          step('help.teacher.grading.s4', {
            score: { key: 'teacherAttemptDetail.scoreOutOf', values: { max: '…' } },
          }),
          step('help.teacher.grading.s5', {
            saveNext: 'scoring.grade.saveAndNext',
            save: 'teacherAttemptDetail.saveGrade',
          }),
        ],
      },
    ],
    notes: [note('tip', 'help.teacher.grading.note', { provisional: 'scoring.provisional.studentChip' })],
  },
  {
    id: 'release',
    titleKey: 'help.teacher.release.title',
    introKey: 'help.teacher.release.intro',
    groups: [
      {
        steps: [
          step('help.teacher.release.s1', { assignments: 'classWorkspace.tabs.assignments' }),
          step('help.teacher.release.s2', { show: 'scoring.release.rowShow' }),
          step('help.teacher.release.s3', { confirm: 'scoring.release.confirm' }),
          step('help.teacher.release.s4', { hide: 'scoring.release.rowHide' }),
        ],
      },
    ],
    notes: [note('tip', 'help.teacher.release.note', { auto: 'assignDialog.autoPublishLabel' })],
  },
  {
    id: 'grades',
    titleKey: 'help.teacher.grades.title',
    introKey: 'help.teacher.grades.intro',
    groups: [
      {
        steps: [
          step('help.teacher.grades.s1', { grades: 'classWorkspace.tabs.grades' }),
          step('help.teacher.grades.s2'),
          step('help.teacher.grades.s3'),
          step('help.teacher.grades.s4', { export: 'classGrades.exportButton' }),
        ],
      },
    ],
  },
  {
    id: 'announcements',
    titleKey: 'help.teacher.announcements.title',
    introKey: 'help.teacher.announcements.intro',
    groups: [
      {
        steps: [
          step('help.teacher.announcements.s1', { announcements: 'classWorkspace.tabs.announcements' }),
          step('help.teacher.announcements.s2', { composer: 'classAnnouncements.composerLabel' }),
          step('help.teacher.announcements.s3', { pin: 'classAnnouncements.pinOnPost' }),
          step('help.teacher.announcements.s4', { post: 'classAnnouncements.post' }),
          step('help.teacher.announcements.s5', {
            edit: 'classAnnouncements.edit',
            delete: 'classAnnouncements.delete',
          }),
        ],
      },
    ],
  },
];

const STUDENT_SECTIONS: SectionDef[] = [
  {
    id: 'todo',
    titleKey: 'help.student.todo.title',
    groups: [
      {
        steps: [
          step('help.student.todo.s1', { assignments: 'studentNav.assignments' }),
          step('help.student.todo.s2', { open: 'studentHome.section.open' }),
          step('help.student.todo.s3'),
        ],
      },
    ],
  },
  {
    id: 'doTest',
    titleKey: 'help.student.doTest.title',
    groups: [
      {
        steps: [
          step('help.student.doTest.s1', { start: 'studentHome.action.start' }),
          step('help.student.doTest.s2'),
          step('help.student.doTest.s3', { resume: 'studentHome.action.resume' }),
          step('help.student.doTest.s4', { submit: 'takeTest.submitTest' }),
        ],
      },
    ],
  },
  {
    id: 'grades',
    titleKey: 'help.student.grades.title',
    groups: [
      {
        steps: [
          step('help.student.grades.s1', { grades: 'studentNav.grades' }),
          step('help.student.grades.s2', { waiting: 'studentGrades.status.awaitingPublish' }),
          step('help.student.grades.s3', { viewResult: 'studentGrades.viewResult' }),
        ],
      },
    ],
  },
  {
    id: 'vocab',
    titleKey: 'help.student.vocab.title',
    groups: [
      {
        steps: [
          step('help.student.vocab.s1', { flashcards: 'studentNav.flashcards' }),
          step('help.student.vocab.s2', { study: 'studentFlashcards.studyLink' }),
          step('help.student.vocab.s3'),
        ],
      },
    ],
  },
  {
    id: 'news',
    titleKey: 'help.student.news.title',
    groups: [
      {
        steps: [
          step('help.student.news.s1', {
            assignments: 'studentNav.assignments',
            announcements: 'classAnnouncements.student.heading',
          }),
          step('help.student.news.s2', { bell: 'studentNotifications.bellLabel' }),
          step('help.student.news.s3', { calendar: 'studentNotifications.viewCalendar' }),
        ],
      },
    ],
  },
];

const TEACHER_GLOSSARY: GlossaryDef[] = [
  { termKey: 'teacherNav.classes', definitionKey: 'help.glossary.classes.def' },
  { termKey: 'teacherNav.library', definitionKey: 'help.glossary.library.def' },
  { termKey: 'classWorkspace.tabs.assignments', definitionKey: 'help.glossary.assignments.def' },
  { termKey: 'classWorkspace.semesterLabel', definitionKey: 'help.glossary.semester.def' },
  {
    termKey: 'help.glossary.assign.term',
    definitionKey: 'help.glossary.assign.def',
    definitionLabels: { library: 'teacherNav.library' },
  },
  { termKey: 'classAssignments.actions.schedule', definitionKey: 'help.glossary.deadline.def' },
  { termKey: 'scoring.release.confirm', definitionKey: 'help.glossary.release.def' },
  { termKey: 'scoring.provisional.studentChip', definitionKey: 'help.glossary.provisional.def' },
];

/** Renders one copy string with its `{{placeholders}}` filled from real UI labels, each label
 * wrapped in a bold chip. */
function RichText({ i18nKey, labels }: { i18nKey: string; labels?: Record<string, LabelSpec> }) {
  const { t } = useTranslation();
  const values: Record<string, string> = {};
  for (const [name, spec] of Object.entries(labels ?? {})) {
    values[name] = typeof spec === 'string' ? t(spec) : t(spec.key, spec.values);
  }
  return (
    <Trans
      i18nKey={i18nKey}
      values={values}
      components={{
        b: (
          <b
            data-help-label=""
            className="rounded-md bg-primary-100 px-1.5 py-0.5 font-semibold text-primary-800 [box-decoration-break:clone]"
          />
        ),
      }}
    />
  );
}

function StepList({ steps }: { steps: StepDef[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((item, index) => (
        <li key={item.key} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-700 text-base font-bold text-base-white"
          >
            {index + 1}
          </span>
          <span className="min-w-0 break-words text-lg leading-8 text-base-black">
            <RichText i18nKey={item.key} labels={item.labels} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function Note({ item }: { item: NoteDef }) {
  const { t } = useTranslation();
  const tone =
    item.tone === 'warning'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-primary-200 bg-primary-50 text-base-black';
  return (
    <p className={`rounded-xl border px-4 py-3 text-base leading-7 ${tone}`}>
      <span className="font-bold">
        {t(item.tone === 'warning' ? 'help.noteWarning' : 'help.noteTip')}{' '}
      </span>
      <RichText i18nKey={item.key} labels={item.labels} />
    </p>
  );
}

function GuideSection({ section, number, prefix }: { section: SectionDef; number: number; prefix: string }) {
  const { t } = useTranslation();
  const headingId = `${prefix}-${section.id}-heading`;
  return (
    <section
      id={`${prefix}-${section.id}`}
      aria-labelledby={headingId}
      className="help-step-card scroll-mt-4 rounded-2xl border border-primary-200 bg-base-white p-5 sm:p-6"
    >
      <h2 id={headingId} className="text-2xl font-bold text-primary-700">
        {number}. {t(section.titleKey)}
      </h2>
      {section.introKey && <p className="mt-2 text-lg text-base-black/70">{t(section.introKey)}</p>}
      <div className="mt-4 flex flex-col gap-6">
        {section.groups.map((group, index) => (
          <div key={group.titleKey ?? index}>
            {group.titleKey && (
              <h3 className="mb-3 text-xl font-bold text-base-black">{t(group.titleKey)}</h3>
            )}
            <StepList steps={group.steps} />
          </div>
        ))}
        {section.notes?.map((item) => <Note key={item.key} item={item} />)}
      </div>
    </section>
  );
}

function Glossary({ items }: { items: GlossaryDef[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="help-glossary-heading"
      className="help-step-card rounded-2xl border border-primary-200 bg-primary-50 p-5 sm:p-6"
    >
      <h2 id="help-glossary-heading" className="text-2xl font-bold text-primary-700">
        {t('help.glossary.heading')}
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,12rem)_1fr]">
        {items.map((item) => {
          const labels: Record<string, string> = {};
          for (const [name, spec] of Object.entries(item.definitionLabels ?? {})) {
            labels[name] = typeof spec === 'string' ? t(spec) : t(spec.key, spec.values);
          }
          return (
            <div key={item.termKey} className="contents">
              <dt className="text-lg font-bold text-base-black">{t(item.termKey)}</dt>
              <dd className="text-lg text-base-black/80 sm:-mt-0">{t(item.definitionKey, labels)}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

type Audience = 'teacher' | 'student';

/** "Trợ giúp" page — see the file doc comment. */
function HelpPage(): ReactElement {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  // Only a visitor who is not logged in can flip between the two guides.
  const [picked, setPicked] = useState<Audience | null>(null);

  if (isLoading) {
    return <p className="text-center text-base-black/60">{t('common.loading')}</p>;
  }

  const ownAudience: Audience = user?.role === 'student' ? 'student' : 'teacher';
  const audience: Audience = user ? ownAudience : (picked ?? 'teacher');
  const sections = audience === 'student' ? STUDENT_SECTIONS : TEACHER_SECTIONS;
  const prefix = `help-${audience}`;

  return (
    <div className="help-page mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-bold text-primary-700">
            {t(audience === 'student' ? 'help.student.heading' : 'help.teacher.heading')}
          </h1>
          <button
            type="button"
            onClick={() => window.print()}
            className="print-hidden inline-flex min-h-10 items-center rounded-md border border-primary-300 bg-base-white px-4 text-base font-medium text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            {t('help.print')}
          </button>
        </div>
        <p className="text-lg text-base-black/80">
          <RichText
            i18nKey={audience === 'student' ? 'help.student.intro' : 'help.teacher.intro'}
            labels={{ textSize: 'header.textSize.toLarge' }}
          />
        </p>
        {!user && (
          <p className="print-hidden text-base">
            <button
              type="button"
              onClick={() => setPicked(audience === 'student' ? 'teacher' : 'student')}
              className="font-medium text-primary-700 underline hover:text-primary-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
            >
              {t(audience === 'student' ? 'help.switchToTeacher' : 'help.switchToStudent')}
            </button>
          </p>
        )}
      </div>

      <nav aria-label={t('help.tocAriaLabel')} className="print-hidden">
        <h2 className="mb-2 text-xl font-bold text-base-black">{t('help.toc')}</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${prefix}-${section.id}`}
                className="flex min-h-11 items-center rounded-lg border border-primary-200 bg-base-white px-4 py-2 text-lg font-medium text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
              >
                {index + 1}. {t(section.titleKey)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {sections.map((section, index) => (
        <GuideSection key={section.id} section={section} number={index + 1} prefix={prefix} />
      ))}

      {audience === 'teacher' && <Glossary items={TEACHER_GLOSSARY} />}

      <p className="rounded-2xl border border-primary-300 bg-primary-100 px-5 py-4 text-lg font-semibold text-primary-800">
        {t(audience === 'student' ? 'help.student.stuck' : 'help.teacher.stuck')}
      </p>

      {user && user.role !== 'student' && (
        <p className="print-hidden text-base">
          <Link to="/teacher/classes" className="font-medium text-primary-700 underline hover:text-primary-800">
            {t('classWorkspace.backToClasses')}
          </Link>
        </p>
      )}
    </div>
  );
}

export default HelpPage;
