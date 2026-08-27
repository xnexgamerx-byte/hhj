/**
 * من يملك الحق في التصرّف بحجوزات عيادة معيّنة.
 *
 * الطبيب يملك عياداته، والسكرتير يملك ما أُسنِد إليه — إما ممارسة واحدة أو
 * كل ممارسات عيادة. توحيد هذا في مكان واحد يمنع تكرار فحص الصلاحية
 * في كل دالة، وتكراره هو ما يُنسى منه واحد فيصير ثغرة.
 */
import type { PrismaClient, UserRole } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { forbidden, notFound } from "../../lib/errors.js";

export type ActorScope = {
  role: UserRole;
  /** الممارسات التي يحق له التصرّف بها */
  practiceIds: string[];
  doctorId: string | null;
  staffId: string | null;
  canManageSchedule: boolean;
  canManageProfile: boolean;
};

export async function resolveScope(userId: string, client: PrismaClient = defaultPrisma): Promise<ActorScope> {
  const user = await client.user.findUnique({
    where: { id: userId },
    include: {
      doctor: { include: { practices: { where: { isActive: true }, select: { id: true } } } },
      staffMember: {
        include: {
          clinic: { include: { practices: { where: { isActive: true }, select: { id: true } } } },
        },
      },
    },
  });
  if (!user) throw notFound("USER_NOT_FOUND", "الحساب غير موجود");

  if (user.doctor) {
    return {
      role: user.role,
      practiceIds: user.doctor.practices.map((p) => p.id),
      doctorId: user.doctor.id,
      staffId: null,
      canManageSchedule: true,
      canManageProfile: true,
    };
  }

  if (user.staffMember?.isActive) {
    const staff = user.staffMember;
    // ممارسة محددة إن أُسنِدت، وإلا كل ممارسات العيادة
    const practiceIds = staff.doctorClinicId
      ? [staff.doctorClinicId]
      : (staff.clinic?.practices.map((p) => p.id) ?? []);

    return {
      role: user.role,
      practiceIds,
      doctorId: null,
      staffId: staff.id,
      canManageSchedule: staff.canManageSchedule,
      canManageProfile: staff.canManageProfile,
    };
  }

  throw forbidden("NO_CLINIC", "حسابك غير مرتبط بعيادة. راجع إدارة المنصة");
}

/** يتحقق أن الممارسة ضمن نطاق المستخدم، ويرمي خطأً واضحاً إن لم تكن. */
export function assertOwns(scope: ActorScope, practiceId: string): void {
  if (!scope.practiceIds.includes(practiceId)) {
    throw forbidden("NOT_YOUR_PRACTICE", "هذه العيادة لا تخصك");
  }
}
