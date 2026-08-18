// 《07》第 5.3 节学生 CSV 的纯解析与行级校验。
// CSV 只在导入请求内解析、不落对象存储；字段一律必填，性别只接受「男 / 女」。

export const STUDENT_CSV_COLUMNS = ['姓名', '学号', '手机号', '性别'] as const;
export const STUDENT_CSV_MAX_ROWS = 2000;

export type StudentCsvGender = 'MALE' | 'FEMALE';

export type StudentCsvFailureReason =
  | 'INVALID_ROW'
  | 'INVALID_NAME'
  | 'INVALID_STUDENT_NUMBER'
  | 'INVALID_PHONE'
  | 'INVALID_GENDER'
  | 'DUPLICATE_STUDENT_NUMBER_IN_FILE'
  | 'DUPLICATE_PHONE_IN_FILE';

export interface StudentCsvRow {
  /** 物理记录行号（含表头，从 2 起） */
  row: number;
  name: string;
  studentNumber: string;
  phone: string;
  gender: StudentCsvGender;
}

export interface StudentCsvFailure {
  row: number;
  name: string | null;
  studentNumber: string | null;
  phone: string | null;
  reason: StudentCsvFailureReason;
  detail: string;
}

export class StudentCsvHeaderError extends Error {
  constructor() {
    super(
      `Student CSV header must be exactly: ${STUDENT_CSV_COLUMNS.join(',')}`,
    );
    this.name = 'StudentCsvHeaderError';
  }
}

export class StudentCsvSizeError extends Error {
  constructor(maxRows: number) {
    super(`Student CSV exceeds the maximum of ${maxRows} data rows`);
    this.name = 'StudentCsvSizeError';
  }
}

const STUDENT_NUMBER_PATTERN = /^[0-9A-Za-z-]{1,50}$/;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

export function parseStudentCsv(csv: string): {
  rows: StudentCsvRow[];
  failures: StudentCsvFailure[];
} {
  const records = parseCsvRecords(csv.replace(/^\uFEFF/, ''));
  while (records.length > 0 && isBlankRecord(records[0]!)) {
    records.shift();
  }
  if (records.length === 0) {
    throw new StudentCsvHeaderError();
  }
  const header = (records[0] ?? []).map((cell) => cell.trim());
  if (
    header.length !== STUDENT_CSV_COLUMNS.length ||
    header.some((cell, index) => cell !== STUDENT_CSV_COLUMNS[index])
  ) {
    throw new StudentCsvHeaderError();
  }

  const dataRecords = records
    .map((record, index) => ({ record, recordIndex: index }))
    .filter(({ record, recordIndex }) => recordIndex > 0 && !isBlankRecord(record));
  if (dataRecords.length > STUDENT_CSV_MAX_ROWS) {
    throw new StudentCsvSizeError(STUDENT_CSV_MAX_ROWS);
  }

  const rows: StudentCsvRow[] = [];
  const failures: StudentCsvFailure[] = [];
  // 只有完全合法的行才登记占位：校验失败的行不会导入，不构成后续行的重复判定基准
  const seenStudentNumbers = new Map<string, number>();
  const seenPhones = new Map<string, number>();

  for (const { record, recordIndex } of dataRecords) {
    const rowNumber = recordIndex + 1;
    const [rawName, rawStudentNumber, rawPhone, rawGender] = record;
    const name = (rawName ?? '').trim();
    const studentNumber = (rawStudentNumber ?? '').trim();
    const phone = (rawPhone ?? '').trim();
    const gender = (rawGender ?? '').trim();

    if (record.length !== STUDENT_CSV_COLUMNS.length) {
      failures.push({
        row: rowNumber,
        name: name || null,
        studentNumber: studentNumber || null,
        phone: phone || null,
        reason: 'INVALID_ROW',
        detail: `该行列数与表头不符（应为 ${STUDENT_CSV_COLUMNS.length} 列，实为 ${record.length} 列）`,
      });
      continue;
    }

    const invalid = firstInvalidField(name, studentNumber, phone, gender);
    if (invalid) {
      failures.push({
        row: rowNumber,
        name: name || null,
        studentNumber: studentNumber || null,
        phone: phone || null,
        reason: invalid.reason,
        detail: invalid.detail,
      });
      continue;
    }

    const duplicateStudentNumberRow = seenStudentNumbers.get(studentNumber);
    if (duplicateStudentNumberRow !== undefined) {
      failures.push({
        row: rowNumber,
        name,
        studentNumber,
        phone,
        reason: 'DUPLICATE_STUDENT_NUMBER_IN_FILE',
        detail: `学号在本次 CSV 内重复（首次出现在第 ${duplicateStudentNumberRow} 行）`,
      });
      continue;
    }
    const duplicatePhoneRow = seenPhones.get(phone);
    if (duplicatePhoneRow !== undefined) {
      failures.push({
        row: rowNumber,
        name,
        studentNumber,
        phone,
        reason: 'DUPLICATE_PHONE_IN_FILE',
        detail: `手机号在本次 CSV 内重复（首次出现在第 ${duplicatePhoneRow} 行）`,
      });
      continue;
    }

    seenStudentNumbers.set(studentNumber, rowNumber);
    seenPhones.set(phone, rowNumber);
    rows.push({
      row: rowNumber,
      name,
      studentNumber,
      phone,
      gender: gender === '男' ? 'MALE' : 'FEMALE',
    });
  }

  return { rows, failures };
}

function firstInvalidField(
  name: string,
  studentNumber: string,
  phone: string,
  gender: string,
): { reason: StudentCsvFailureReason; detail: string } | null {
  if (name.length < 2 || name.length > 100) {
    return { reason: 'INVALID_NAME', detail: '姓名必填且长度须为 2–100 个字符' };
  }
  if (!STUDENT_NUMBER_PATTERN.test(studentNumber)) {
    return {
      reason: 'INVALID_STUDENT_NUMBER',
      detail: '学号必填，仅可使用数字、字母与连字符，长度 1–50',
    };
  }
  if (!PHONE_PATTERN.test(phone)) {
    return { reason: 'INVALID_PHONE', detail: '手机号必须是大陆 11 位手机号' };
  }
  if (gender !== '男' && gender !== '女') {
    return {
      reason: 'INVALID_GENDER',
      detail: '性别只接受「男」或「女」（未说明仅平台学员自助注册可选）',
    };
  }
  return null;
}

function isBlankRecord(record: string[]): boolean {
  return record.length === 1 && (record[0] ?? '').trim() === '';
}

/** RFC 4180 宽松版：接受 LF / CRLF / CR，字段可加引号、引号内以 "" 转义 */
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      record.push(field);
      field = '';
      continue;
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') {
        index++;
      }
      record.push(field);
      field = '';
      records.push(record);
      record = [];
      continue;
    }
    field += char;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}
