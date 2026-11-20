import { handleErrors, parseColorRange } from '../utils';

describe('handleErrors', () => {
  let mockVis: any;
  let mockResponse: any;

  beforeEach(() => {
    mockVis = {
      addError: jest.fn(),
      clearErrors: jest.fn(),
    };
    mockResponse = {
      fields: {
        pivots: [],
        dimensions: [],
        measure_like: [],
      },
    };
  });

  it('should return false and add error if there are not enough dimensions', () => {
    const options = {
      min_pivots: 0, max_pivots: 0,
      min_dimensions: 1, max_dimensions: 2,
      min_measures: 1, max_measures: 1
    };

    mockResponse.fields.dimensions = []; // 0 dimensions
    mockResponse.fields.measure_like = [{ name: 'm1' }];

    const result = handleErrors(mockVis, mockResponse, options);

    expect(result).toBe(false);
    expect(mockVis.addError).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Not Enough Dimensions',
    }));
  });

  it('should return false and add error if there are too many measures', () => {
    const options = {
      min_pivots: 0, max_pivots: 0,
      min_dimensions: 1, max_dimensions: 2,
      min_measures: 1, max_measures: 1
    };

    mockResponse.fields.dimensions = [{ name: 'd1' }];
    mockResponse.fields.measure_like = [{ name: 'm1' }, { name: 'm2' }]; // 2 measures

    const result = handleErrors(mockVis, mockResponse, options);

    expect(result).toBe(false);
    expect(mockVis.addError).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Too Many Measures',
    }));
  });

  it('should return true and clear errors if validation passes', () => {
    const options = {
      min_pivots: 0, max_pivots: 0,
      min_dimensions: 1, max_dimensions: 2,
      min_measures: 1, max_measures: 1
    };

    mockResponse.fields.dimensions = [{ name: 'd1' }];
    mockResponse.fields.measure_like = [{ name: 'm1' }];

    const result = handleErrors(mockVis, mockResponse, options);

    expect(result).toBe(true);
    expect(mockVis.clearErrors).toHaveBeenCalled();
  });
});

describe('parseColorRange', () => {
  it('normalizes multi-element arrays, Looker comma-separated single-element arrays, and raw strings', () => {
    expect(parseColorRange(['#E91E63', '#00BCD4'])).toEqual(['#E91E63', '#00BCD4']);
    expect(parseColorRange(['#E91E63, #00BCD4, #4CAF50'])).toEqual([
      '#E91E63',
      '#00BCD4',
      '#4CAF50',
    ]);
    expect(parseColorRange('#E91E63, #00BCD4')).toEqual(['#E91E63', '#00BCD4']);
  });

  it('preserves commas inside CSS functional colors and strips surrounding quotes', () => {
    expect(
      parseColorRange([
        '"#E91E63", \'#00BCD4\', rgb(233, 30, 99), rgba(0, 188, 212, 0.8), hsl(122, 39%, 49%)',
      ])
    ).toEqual([
      '#E91E63',
      '#00BCD4',
      'rgb(233, 30, 99)',
      'rgba(0, 188, 212, 0.8)',
      'hsl(122, 39%, 49%)',
    ]);
  });

  it('returns empty array for null, undefined, empty arrays, and blank strings', () => {
    expect(parseColorRange(null)).toEqual([]);
    expect(parseColorRange(undefined)).toEqual([]);
    expect(parseColorRange([])).toEqual([]);
    expect(parseColorRange(['', ' , '])).toEqual([]);
  });
});
