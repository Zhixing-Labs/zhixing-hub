import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaService } from './infrastructure/prisma/prisma.service';

loadEnv({ path: resolve(__dirname, '../../../.env'), quiet: true });

const PUBLIC_ACADEMY_TENANT_NAME = '知行公开学院';
const PUBLIC_ACADEMY_TENANT_ID = '00000000-0000-4000-8000-000000000101';

// 行政区划首批种子（《11》第 6.6 节）：北京市与宁夏各市，两级（省 + 地级市）。
// 直辖市按「省级节点 + 同名地级市节点（110100）」简化建模，后续由运营按字典流程扩展。
const DIVISION_SEEDS: Array<{
  code: string;
  name: string;
  level: 'PROVINCE' | 'PREFECTURE';
  parentCode?: string;
}> = [
  { code: '110000', name: '北京市', level: 'PROVINCE' },
  { code: '110100', name: '北京市', level: 'PREFECTURE', parentCode: '110000' },
  { code: '640000', name: '宁夏回族自治区', level: 'PROVINCE' },
  { code: '640100', name: '银川市', level: 'PREFECTURE', parentCode: '640000' },
  { code: '640200', name: '石嘴山市', level: 'PREFECTURE', parentCode: '640000' },
  { code: '640300', name: '吴忠市', level: 'PREFECTURE', parentCode: '640000' },
  { code: '640400', name: '固原市', level: 'PREFECTURE', parentCode: '640000' },
  { code: '640500', name: '中卫市', level: 'PREFECTURE', parentCode: '640000' },
];

/**
 * 知行公开学院预置（《07》2.5）：按行政区划字典每一个地级市节点建
 * 「校区 + 学院」，系统预置、运营不可删除；无学员的市可停用（拒绝新注册）。
 * 幂等：已存在的节点跳过，不触碰停用状态。
 */
async function bootstrapPublicAcademy(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    for (const seed of DIVISION_SEEDS) {
      await prisma.administrativeDivision.upsert({
        where: { code: seed.code },
        create: {
          code: seed.code,
          name: seed.name,
          level: seed.level,
          parentCode: seed.parentCode ?? null,
          active: true,
        },
        update: {},
      });
    }

    const prefectures = await prisma.administrativeDivision.findMany({
      where: { level: 'PREFECTURE', active: true },
      orderBy: { code: 'asc' },
    });

    await prisma.$transaction(async (transaction) => {
      await transaction.tenant.upsert({
        where: { id: PUBLIC_ACADEMY_TENANT_ID },
        create: {
          id: PUBLIC_ACADEMY_TENANT_ID,
          type: 'UNIVERSITY',
          name: PUBLIC_ACADEMY_TENANT_NAME,
          university: { create: { isPublicAcademy: true } },
        },
        update: {},
      });
      for (const division of prefectures) {
        const name = `${PUBLIC_ACADEMY_TENANT_NAME}${division.name}校区`;
        const campus = await transaction.campus.upsert({
          where: { tenantId_name: { tenantId: PUBLIC_ACADEMY_TENANT_ID, name } },
          create: {
            tenantId: PUBLIC_ACADEMY_TENANT_ID,
            name,
            divisionCode: division.code,
          },
          update: {},
        });
        const college = await transaction.college.upsert({
          where: { tenantId_name: { tenantId: PUBLIC_ACADEMY_TENANT_ID, name } },
          create: { tenantId: PUBLIC_ACADEMY_TENANT_ID, name },
          update: {},
        });
        await transaction.collegeCampus.upsert({
          where: {
            collegeId_campusId: { collegeId: college.id, campusId: campus.id },
          },
          create: {
            tenantId: PUBLIC_ACADEMY_TENANT_ID,
            collegeId: college.id,
            campusId: campus.id,
            sortOrder: 0,
          },
          update: {},
        });
      }
    });

    console.log(
      `[bootstrap] public academy ready: ${PUBLIC_ACADEMY_TENANT_NAME}, ${prefectures.length} city colleges provisioned`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void bootstrapPublicAcademy();
