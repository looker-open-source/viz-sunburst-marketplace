module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { 
      tsconfig: { 
        allowJs: true,
        esModuleInterop: true,
        module: 'commonjs',
        target: 'es2020'
      } 
    }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(d3|d3-array|delaunator|robust-predicates|internmap|d3-.*)/)',
  ],
};
