import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: Partial<PrismaService>;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as Partial<PrismaService>;

    usersService = new UsersService(prisma as PrismaService);
  });

  it('maps roles to uppercase when creating a user', async () => {
    const now = new Date();
    (prisma.user!.create as jest.Mock).mockResolvedValue({
      id: 'user_1',
      createdAt: now,
      updatedAt: now,
      email: 'demo@example.com',
      hashedPassword: 'hash',
      phone: null,
      firstName: 'Demo',
      lastName: 'User',
      preferredLocale: 'de',
      isActive: true,
      roles: ['CLIENT'],
      companyMemberships: [],
    });

    const result = await usersService.create(
      {
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        roles: ['client'],
        preferredLocale: 'de',
      },
      'hash'
    );

    expect(prisma.user!.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roles: ['CLIENT'] }),
      })
    );
    expect(result.roles).toEqual(['client']);
  });

  it('throws when user not found', async () => {
    (prisma.user!.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(usersService.findOne('missing')).rejects.toThrow('USER_NOT_FOUND');
  });
});
