// Mock looker global before importing sunburst
const mockAdd = jest.fn();
(global as any).looker = {
  plugins: {
    visualizations: {
      add: mockAdd,
    },
  },
};
(global as any).LookerCharts = {
  Utils: {
    openDrillMenu: jest.fn(),
  },
};

import '../sunburst/sunburst'; // Trigger registration

describe('Sunburst Visualization', () => {
  let vis: any;
  let element: HTMLElement;
  let doneCallback: jest.Mock;

  beforeEach(() => {
    // Get the vis object that was registered
    expect(mockAdd).toHaveBeenCalled();
    vis = mockAdd.mock.calls[0][0];
    
    element = document.createElement('div');
    // Mock element dimensions
    Object.defineProperty(element, 'clientWidth', { value: 500, configurable: true });
    Object.defineProperty(element, 'clientHeight', { value: 500, configurable: true });
    
    doneCallback = jest.fn();
  });

  it('should register with looker', () => {
    expect(vis).toBeDefined();
    expect(vis.id).toBe('sunburst');
  });

  it('should call done() when rendering completes successfully', () => {
    vis.create(element, {});

    const data = [
      {
        'dim1': { value: 'A' },
        'meas1': { value: 10 }
      },
      {
        'dim1': { value: 'B' },
        'meas1': { value: 20 }
      }
    ];

    const queryResponse = {
      fields: {
        pivots: [],
        dimensions: [{ name: 'dim1' }],
        dimension_like: [{ name: 'dim1' }],
        measure_like: [{ name: 'meas1', value_format: '#,##0' }]
      }
    };

    const config = {
      color_range: ['#fff'],
      color_by: 'root',
      show_null_points: true,
      value_format_override: '',
      show_percent: true
    };

    vis.updateAsync(data, element, config, queryResponse, undefined, doneCallback);

    expect(doneCallback).toHaveBeenCalled();
  });

  it('should call done() and add error when handleErrors fails', () => {
     vis.create(element, {});
     vis.addError = jest.fn();
     vis.clearErrors = jest.fn();

     const data: any[] = [];
     const queryResponse = {
       fields: {
         pivots: [],
         dimensions: [], // No dimensions -> should fail
         dimension_like: [],
         measure_like: [{ name: 'meas1' }]
       }
     };

     vis.updateAsync(data, element, {}, queryResponse, undefined, doneCallback);

     expect(doneCallback).toHaveBeenCalled();
     expect(vis.addError).toHaveBeenCalled();
  });

  it('should call done() and handle runtime errors defensively', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    vis.create(element, {});
    vis.addError = jest.fn();
    vis.clearErrors = jest.fn();

    // Pass malformed data that will cause error (missing dim1 field)
    const data = [
      {
        'meas1': { value: 10 }
      }
    ];

    const queryResponse = {
      fields: {
        pivots: [],
        dimensions: [{ name: 'dim1' }],
        dimension_like: [{ name: 'dim1' }],
        measure_like: [{ name: 'meas1' }]
      }
    };

    vis.updateAsync(data, element, {}, queryResponse, undefined, doneCallback);

    expect(doneCallback).toHaveBeenCalled();
    expect(vis.addError).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Rendering Error',
    }));
    consoleSpy.mockRestore();
  });
});
