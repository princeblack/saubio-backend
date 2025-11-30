import type { Config } from 'jest';

const config: Config = {
  displayName: 'saubio-backend',
  rootDir: '.',
  testEnvironment: 'node',
  preset: 'ts-jest',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/libs/', '\\.e2e\\.spec\\.ts$'],
  moduleNameMapper: {
    '^@saubio/models(.*)$': '<rootDir>/libs/models/src$1',
    '^@saubio/config(.*)$': '<rootDir>/libs/config/src$1',
    '^@saubio/prisma/(.*)$': '<rootDir>/prisma/$1',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: './coverage',
};

export default config;
