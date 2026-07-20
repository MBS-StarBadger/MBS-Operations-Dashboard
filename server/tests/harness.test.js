const app = require('../index');

describe('Test Harness', () => {
  test('Express app can be imported', () => {
    expect(app).toBeDefined();
    expect(typeof app).toBe('function');
  });
});