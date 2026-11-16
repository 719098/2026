import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { ClassEntity, CourseSession, Student, TransferClassRecord } from '../types';
import { isSessionCancelledOrSuspended } from './attendanceUtils';
import { isStudentInClassOnDate } from './studentTimelineUtils';

export interface CertificateStatsResult {
  weeklyHours: number;
  expectedHours: number;
  leaveHours: number;
  absentHours: number;
  actualHours: number;
  validSessionCount: number;
}

export interface CertificateGenerationPayload {
  studentName: string;
  englishNameWithTitle: string;
  nationalityLabel: string;
  registrationStartDate: string;
  registrationEndDate: string;
  recordStartDate: string;
  recordEndDate: string;
  weeklyHours: number;
  expectedHours: number;
  leaveHours: number;
  absentHours: number;
  actualHours: number;
  issueDate: string;
  studentNumber?: string;
}

/**
 * Pure helper to calculate certificate attendance statistics across valid sessions
 * within the specified [recordStartDate, recordEndDate] window and the student's class timeline.
 * Formula: actualHours = expectedHours - leaveHours - absentHours
 */
export function computeCertificateAttendanceStats(params: {
  student: Student;
  allCourses: CourseSession[];
  classes?: ClassEntity[];
  transferRecords?: TransferClassRecord[];
  recordStartDate: string;
  recordEndDate: string;
}): CertificateStatsResult {
  const { student, allCourses, classes = [], transferRecords = [], recordStartDate, recordEndDate } = params;

  let expectedHours = 0;
  let leaveHours = 0;
  let absentHours = 0;
  let validSessionCount = 0;
  const classIdsSeen = new Set<string>();
  const periodsPerWeekByClass = new Map<string, number>();

  for (const session of allCourses) {
    if (!session || !session.date) continue;
    if (isSessionCancelledOrSuspended(session)) continue;
    if (recordStartDate && session.date < recordStartDate) continue;
    if (recordEndDate && session.date > recordEndDate) continue;

    const hasExplicitRecord = Boolean(session.attendanceData && session.attendanceData[student.id]);
    const inClassOnDate = isStudentInClassOnDate(
      student,
      session.classId,
      session.date,
      transferRecords,
      session.className
    );
    if (!hasExplicitRecord && !inClassOnDate) continue;

    validSessionCount += 1;
    const pCount = session.periodsCount || 3;
    expectedHours += pCount;

    if (session.classId) {
      classIdsSeen.add(session.classId);
    }

    const att = session.attendanceData?.[student.id];
    if (att) {
      const periods = [att.period1, att.period2, att.period3, att.period4].slice(0, pCount);
      periods.forEach((p) => {
        if (p === 'leave') leaveHours += 1;
        else if (p === 'absent') absentHours += 1;
      });
    }
  }

  // Estimate weekly hours from the student's current/seen class schedule rule (fallback 15 hours/week)
  const targetClassId = student.classId || Array.from(classIdsSeen)[0];
  const matchedClass = classes.find((c) => c.id === targetClassId || c.name === student.className);
  if (matchedClass && Array.isArray(matchedClass.weeklyDays) && matchedClass.weeklyDays.length > 0) {
    const pPerDay = matchedClass.dailyHours || 3;
    periodsPerWeekByClass.set(matchedClass.id, matchedClass.weeklyDays.length * pPerDay);
  }
  const weeklyHours = (matchedClass && periodsPerWeekByClass.get(matchedClass.id)) || 15;

  const actualHours = Math.max(0, Math.round((expectedHours - leaveHours - absentHours) * 10) / 10);

  return {
    weeklyHours,
    expectedHours: Math.round(expectedHours * 10) / 10,
    leaveHours: Math.round(leaveHours * 10) / 10,
    absentHours: Math.round(absentHours * 10) / 10,
    actualHours,
    validSessionCount,
  };
}

export function formatChineseDateLong(isoDate: string): string {
  const clean = (isoDate || '').trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return clean || '未設定';
  return `${match[1]} 年 ${match[2]} 月 ${match[3]} 日`;
}

export function formatDotDate(isoDate: string): string {
  const clean = (isoDate || '').trim();
  if (!clean) return '—';
  return clean.replace(/-/g, '.');
}

const CHINESE_NUMERALS = ['○', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CHINESE_MONTHS = [
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
  '十一',
  '十二',
];
const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function numberToChineseDay(day: number): string {
  if (day <= 10) return day === 10 ? '十' : CHINESE_NUMERALS[day];
  if (day < 20) return `十${CHINESE_NUMERALS[day - 10]}`;
  if (day === 20) return '二十';
  if (day < 30) return `二十${CHINESE_NUMERALS[day - 20]}`;
  if (day === 30) return '三十';
  return '三十一';
}

export function formatBilingualIssueDate(isoDate: string): {
  english: string;
  chinese: string;
} {
  const match = (isoDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { english: isoDate, chinese: isoDate };
  }
  const yearStr = match[1];
  const monthIdx = parseInt(match[2], 10) - 1;
  const dayNum = parseInt(match[3], 10);

  const engMonth = ENGLISH_MONTHS[monthIdx] || match[2];
  const chiYear = yearStr
    .split('')
    .map((d) => CHINESE_NUMERALS[parseInt(d, 10)] || d)
    .join('');
  const chiMonth = CHINESE_MONTHS[monthIdx] || match[2];
  const chiDay = numberToChineseDay(dayNum);

  return {
    english: `${engMonth} ${dayNum}, ${yearStr}`,
    chinese: `${chiYear}年${chiMonth}月${chiDay}日`,
  };
}

export function buildDefaultNationalityLabel(nationality?: string): string {
  const clean = (nationality || '').trim();
  if (!clean || clean === '未設定') return '外籍生';
  if (clean.endsWith('籍生') || clean.endsWith('生')) return clean;
  if (clean.endsWith('籍')) return `${clean}生`;
  return `${clean}籍生`;
}

export function buildDefaultEnglishWithTitle(student: Student): string {
  const title = student.gender === 'F' ? 'Ms.' : 'Mr.';
  const eng = (student.englishName || student.ename || '').trim();
  return eng ? `${title} ${eng}` : title;
}

async function fetchStampBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

const THIN_BORDER = {
  style: BorderStyle.SINGLE,
  size: 6,
  color: '000000',
};

const NO_BORDER = {
  style: BorderStyle.NONE,
  size: 0,
  color: 'FFFFFF',
};

const FONT_ZH = 'DFKai-SB';
const FONT_EN = 'Times New Roman';

function makeHeaderCell(lines: string[], widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 60, right: 60 },
    borders: {
      top: THIN_BORDER,
      bottom: THIN_BORDER,
      left: THIN_BORDER,
      right: THIN_BORDER,
    },
    children: lines.map(
      (line) =>
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0, line: 260 },
          children: [
            new TextRun({
              text: line,
              size: 24, // 12pt
              font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
              color: '000000',
            }),
          ],
        })
    ),
  });
}

function makeDataCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 90, bottom: 90, left: 60, right: 60 },
    borders: {
      top: THIN_BORDER,
      bottom: THIN_BORDER,
      left: THIN_BORDER,
      right: THIN_BORDER,
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text,
            size: 24, // 12pt
            font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
            color: '000000',
          }),
        ],
      }),
    ],
  });
}

/**
 * Generates a .docx Blob matching 靜宜大學華語文教學中心「在學證明書暨出席記錄表」.
 */
export async function generateCertificateDocxBlob(
  payload: CertificateGenerationPayload,
  stampBuffers?: { clecSeal?: Uint8Array | null; directorStamp?: Uint8Array | null }
): Promise<Blob> {
  const clecSealBytes =
    stampBuffers && 'clecSeal' in stampBuffers
      ? stampBuffers.clecSeal
      : await fetchStampBytes('/assets/stamps/clec_seal.png');
  const directorStampBytes =
    stampBuffers && 'directorStamp' in stampBuffers
      ? stampBuffers.directorStamp
      : await fetchStampBytes('/assets/stamps/director_stamp.png');

  const regStartText = payload.registrationStartDate
    ? formatChineseDateLong(payload.registrationStartDate)
    : '未設定';
  const regEndText = payload.registrationEndDate
    ? formatChineseDateLong(payload.registrationEndDate)
    : '未設定';
  const periodStr = `${formatDotDate(payload.recordStartDate)}~${formatDotDate(payload.recordEndDate)}`;
  const issueDates = formatBilingualIssueDate(payload.issueDate);

  const attendanceTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    rows: [
      new TableRow({
        children: [
          makeHeaderCell(['記錄期間'], 30),
          makeHeaderCell(['每週上課', '時數'], 14),
          makeHeaderCell(['應上課', '時數'], 14),
          makeHeaderCell(['請假', '時數'], 14),
          makeHeaderCell(['曠課', '時數'], 14),
          makeHeaderCell(['實際上課', '時數'], 14),
        ],
      }),
      new TableRow({
        children: [
          makeDataCell(periodStr, 30),
          makeDataCell(String(payload.weeklyHours), 14),
          makeDataCell(String(payload.expectedHours), 14),
          makeDataCell(String(payload.leaveHours), 14),
          makeDataCell(String(payload.absentHours), 14),
          makeDataCell(String(payload.actualHours), 14),
        ],
      }),
    ],
  });

  const leftStampParagraphs: Paragraph[] = clecSealBytes
    ? [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 320, after: 0 },
          children: [
            new ImageRun({
              data: clecSealBytes,
              transformation: { width: 155, height: 110 },
              type: 'png',
            }),
          ],
        }),
      ]
    : [new Paragraph({ children: [new TextRun({ text: '' })] })];

  const directorNameRuns: (TextRun | ImageRun)[] = [
    new TextRun({
      text: '林子敬  ',
      size: 28,
      font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
      color: '000000',
    }),
  ];
  if (directorStampBytes) {
    directorNameRuns.push(
      new ImageRun({
        data: directorStampBytes,
        transformation: { width: 120, height: 35 },
        type: 'png',
      })
    );
  }

  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NO_BORDER,
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
      insideHorizontal: NO_BORDER,
      insideVertical: NO_BORDER,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 42, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.BOTTOM,
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            children: leftStampParagraphs,
          }),
          new TableCell({
            width: { size: 58, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 140 },
                children: [
                  new TextRun({
                    text: '華語文教學中心主任',
                    size: 28,
                    font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
                    color: '000000',
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 120 },
                children: directorNameRuns,
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 100 },
                children: [
                  new TextRun({
                    text: 'Director Dr. Tzu-Ching Lin',
                    size: 28,
                    font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
                    color: '000000',
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 100 },
                children: [
                  new TextRun({
                    text: issueDates.english,
                    size: 28,
                    font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
                    color: '000000',
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: [
                  new TextRun({
                    text: issueDates.chinese,
                    size: 28,
                    font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
                    color: '000000',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 140 },
            children: [
              new TextRun({
                text: '在學證明書暨出席記錄表',
                bold: true,
                size: 38, // 19pt
                font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
                color: '000000',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 360 },
            children: [
              new TextRun({
                text: 'Certificate of Study & Attendance Record',
                bold: true,
                size: 34, // 17pt
                font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
                color: '000000',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 120, after: 280, line: 420 },
            children: [
              new TextRun({
                text: `茲證明 ${payload.studentName} (${payload.englishNameWithTitle})為${payload.nationalityLabel}至本校華語文教學中心學習中國文化和語言。註冊起訖日期自 ${regStartText} 至 ${regEndText} 止。`,
                size: 28, // 14pt
                font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
                color: '000000',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 80, after: 140 },
            children: [
              new TextRun({
                text: '該生出席記錄如下：',
                size: 24, // 12pt
                font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
                color: '000000',
              }),
            ],
          }),
          attendanceTable,
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 520, after: 520 },
            children: [
              new TextRun({
                text: '特此證明',
                size: 28, // 14pt
                font: { eastAsia: FONT_ZH, ascii: FONT_EN, hAnsi: FONT_EN },
                color: '000000',
              }),
            ],
          }),
          signatureTable,
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function downloadCertificateDocx(payload: CertificateGenerationPayload): Promise<void> {
  const blob = await generateCertificateDocxBlob(payload);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeFile = `${payload.studentNumber || ''}_${payload.studentName}_在學證明書暨出席記錄表.docx`
    .replace(/^_+/, '')
    .replace(/[\\/:*?"<>|]/g, '_');
  link.href = url;
  link.download = safeFile;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
