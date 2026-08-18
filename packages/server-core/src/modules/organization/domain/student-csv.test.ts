import { describe, expect, it } from 'vitest';
import {
  STUDENT_CSV_COLUMNS,
  STUDENT_CSV_MAX_ROWS,
  StudentCsvHeaderError,
  StudentCsvSizeError,
  parseStudentCsv,
} from './student-csv';

const HEADER = `${STUDENT_CSV_COLUMNS.join(',')}\n`;

describe('parseStudentCsv', () => {
  it('解析合法行并绑定性别映射', () => {
    const result = parseStudentCsv(
      `${HEADER}张三,2026010101,13800138001,男\n李四,2026010102,13800138002,女`,
    );
    expect(result.failures).toEqual([]);
    expect(result.rows).toEqual([
      {
        row: 2,
        name: '张三',
        studentNumber: '2026010101',
        phone: '13800138001',
        gender: 'MALE',
      },
      {
        row: 3,
        name: '李四',
        studentNumber: '2026010102',
        phone: '13800138002',
        gender: 'FEMALE',
      },
    ]);
  });

  it('容忍 UTF-8 BOM、CRLF 与字段两端的空白', () => {
    const result = parseStudentCsv(
      `\uFEFF${STUDENT_CSV_COLUMNS.join(',')}\r\n  王五 , 2026010103 ,13800138003, 男 \r\n`,
    );
    expect(result.failures).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      name: '王五',
      studentNumber: '2026010103',
      phone: '13800138003',
    });
  });

  it('支持带引号字段与转义引号（Excel 常见形态）', () => {
    const result = parseStudentCsv(
      `${HEADER}"张,三",2026010104,13800138004,男`,
    );
    expect(result.failures).toEqual([]);
    expect(result.rows[0]?.name).toBe('张,三');
  });

  it('表头不符、空文件与缺表头整体拒绝', () => {
    expect(() => parseStudentCsv('')).toThrow(StudentCsvHeaderError);
    expect(() => parseStudentCsv('\n\n')).toThrow(StudentCsvHeaderError);
    expect(() => parseStudentCsv('name,studentNumber,phone,gender\n')).toThrow(
      StudentCsvHeaderError,
    );
    expect(() =>
      parseStudentCsv('姓名,学号,手机号\n张三,2026010101,13800138001'),
    ).toThrow(StudentCsvHeaderError);
    expect(() =>
      parseStudentCsv('姓名,学号,手机号,性别,多余\n张三,2026010101,13800138001,男,1'),
    ).toThrow(StudentCsvHeaderError);
  });

  it('格式错误的行逐项报因并跳过，其余行不受影响', () => {
    const result = parseStudentCsv(
      HEADER +
        [
          '张三,2026010101,13800138001,男',
          '李,2026010102,13800138002,女',
          '王五,2026 0103,13800138003,男',
          '赵六,2026010104,1380013800,女',
          '钱七,2026010105,13800138005,未说明',
          '孙八,2026010106,13800138006,男,多一列',
        ].join('\n'),
    );
    expect(result.rows.map((row) => row.name)).toEqual(['张三']);
    expect(result.failures.map((failure) => failure.reason)).toEqual([
      'INVALID_NAME',
      'INVALID_STUDENT_NUMBER',
      'INVALID_PHONE',
      'INVALID_GENDER',
      'INVALID_ROW',
    ]);
    expect(result.failures[0]).toMatchObject({ row: 3, name: '李' });
    expect(result.failures[4]).toMatchObject({
      row: 7,
      name: '孙八',
      studentNumber: '2026010106',
      phone: '13800138006',
    });
  });

  it('CSV 内学号或手机号重复时仅首行有效，后续行报重复并指向首次行号', () => {
    const result = parseStudentCsv(
      HEADER +
        [
          '张三,2026010101,13800138001,男',
          '李四,2026010101,13800138002,女',
          '王五,2026010102,13800138001,男',
        ].join('\n'),
    );
    expect(result.rows.map((row) => row.name)).toEqual(['张三']);
    expect(result.failures).toEqual([
      expect.objectContaining({
        row: 3,
        reason: 'DUPLICATE_STUDENT_NUMBER_IN_FILE',
        detail: expect.stringContaining('第 2 行'),
      }),
      expect.objectContaining({
        row: 4,
        reason: 'DUPLICATE_PHONE_IN_FILE',
        detail: expect.stringContaining('第 2 行'),
      }),
    ]);
  });

  it('校验失败的行不构成后续行的重复判定基准', () => {
    const result = parseStudentCsv(
      HEADER +
        ['张三,2026010101,138001380,男', '李四,2026010101,13800138002,女'].join(
          '\n',
        ),
    );
    expect(result.failures).toHaveLength(1);
    expect(result.rows.map((row) => row.name)).toEqual(['李四']);
  });

  it('空行不占行号、不产生失败记录', () => {
    const result = parseStudentCsv(
      `${HEADER}张三,2026010101,13800138001,男\n\n李四,2026010102,13800138002,女\n`,
    );
    expect(result.failures).toEqual([]);
    expect(result.rows.map((row) => row.row)).toEqual([2, 4]);
  });

  it('超出最大行数整体拒绝', () => {
    const rows = Array.from(
      { length: STUDENT_CSV_MAX_ROWS + 1 },
      (_, index) =>
        `学生${index},${String(index).padStart(8, '0')},13800138000,男`,
    );
    expect(() => parseStudentCsv(HEADER + rows.join('\n'))).toThrow(
      StudentCsvSizeError,
    );
  });
});
