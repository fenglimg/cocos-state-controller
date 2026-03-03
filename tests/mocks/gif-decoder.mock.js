/**
 * Mock for gif-decoder.js to avoid ES module issues in Jest
 */
module.exports = {
  decode: jest.fn(),
  TimeSlicedGifDecoder: jest.fn(),
};
