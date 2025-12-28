import '@prisma/client';

declare module '@prisma/client' {
  interface BookingInvitation {
    viewedAt: Date | null;
  }

  namespace Prisma {
    interface BookingInvitationCreateInput {
      viewedAt?: Date | string | null;
    }

    interface BookingInvitationUncheckedCreateInput {
      viewedAt?: Date | string | null;
    }

    interface BookingInvitationUpdateInput {
      viewedAt?: Date | string | null;
    }

    interface BookingInvitationUncheckedUpdateInput {
      viewedAt?: Date | string | null;
    }

    interface BookingInvitationUpdateManyMutationInput {
      viewedAt?: Date | string | null;
    }

    interface BookingInvitationUncheckedUpdateManyInput {
      viewedAt?: Date | string | null;
    }
  }
}
