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

  it('parses comma-separated and CSS functional color_range strings and falls back to defaults when cleared', () => {
    vis.create(element, {});

    const data = [
      { dim1: { value: 'A' }, meas1: { value: 10 } },
      { dim1: { value: 'B' }, meas1: { value: 20 } },
      { dim1: { value: 'C' }, meas1: { value: 30 } },
    ];
    const queryResponse = {
      fields: {
        pivots: [],
        dimensions: [{ name: 'dim1' }],
        dimension_like: [{ name: 'dim1' }],
        measure_like: [{ name: 'meas1', value_format: '#,##0' }],
      },
    };

    // Comma-separated single-element array + CSS functional color (Looker UI edit format)
    vis.updateAsync(
      data,
      element,
      { color_range: ['#E91E63, rgb(0, 188, 212), "#4CAF50"'] },
      queryResponse,
      undefined,
      doneCallback
    );

    const arcs = Array.from(element.querySelectorAll<SVGPathElement>('svg:not(#trail) path'));
    expect(arcs.length).toBe(4); // root + A, B, C
    expect(arcs[1].style.fill).toBe('#E91E63');
    expect(arcs[2].style.fill).toBe('rgb(0, 188, 212)');
    expect(arcs[3].style.fill).toBe('#4CAF50');

    // Cleared / empty color_range falls back to default 5-color palette
    vis.updateAsync(
      data,
      element,
      { color_range: [''] },
      queryResponse,
      undefined,
      doneCallback
    );
    const fallbackArcs = Array.from(element.querySelectorAll<SVGPathElement>('svg:not(#trail) path'));
    expect(fallbackArcs[1].style.fill).toBe('#4285F4');
    expect(fallbackArcs[2].style.fill).toBe('#EA4335');
  });

  it('handles partial config (undefined value_format_override), center root hover, XSS-safe #endlabel, and drill clicks', () => {
    vis.create(element, {});
    const drillMock = (global as any).LookerCharts.Utils.openDrillMenu as jest.Mock;
    drillMock.mockClear();

    const links = [{ label: 'View', type: 'url', type_label: 'URL', url: '#view' }];
    const data = [
      { dim1: { value: '__proto__', links }, dim2: { value: null }, meas1: { value: 25 } },
      { dim1: { value: 'Alpha' }, dim2: { value: 'Beta' }, meas1: { value: 75 } },
    ];
    const queryResponse = {
      fields: {
        pivots: [],
        dimensions: [{ name: 'dim1' }, { name: 'dim2' }],
        dimension_like: [{ name: 'dim1' }, { name: 'dim2' }],
        measure_like: [{ name: 'meas1' }],
      },
    };

    // Partial config: value_format_override, show_null_points, show_percent, color_by all undefined
    vis.updateAsync(data, element, {}, queryResponse, undefined, doneCallback);

    const trail = element.querySelector('#trail');
    expect(trail?.getAttribute('width')).toBe('500'); // responsive width, not hardcoded 750

    const arcs = Array.from(element.querySelectorAll('svg:not(#trail) path'));
    // Hovering root (depth === 0) must not throw TypeError
    expect(() => {
      arcs[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    }).not.toThrow();

    // Hovering depth-1 arc ("__proto__") updates breadcrumbs, #endlabel (via text), and center %
    arcs[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const endLabel = element.querySelector('#endlabel');
    expect(endLabel?.textContent).toBe('25');
    const centerText = element.querySelector('svg:not(#trail) > g > text');
    expect(centerText?.textContent).toBe(' 25.00%');

    // Clicking root does not open drill menu; clicking arc with links opens drill menu
    arcs[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(drillMock).not.toHaveBeenCalled();

    // Verify XSS payload inside value_format_override is rendered as text, never parsed as HTML
    vis.updateAsync(
      data,
      element,
      { value_format_override: '"<img src=x onerror=1>"#,##0', show_percent: false, show_null_points: false },
      queryResponse,
      undefined,
      doneCallback
    );
    const updatedArcs = Array.from(element.querySelectorAll('svg:not(#trail) path'));
    // With show_null_points: false, null dim2 is skipped (root, __proto__, Alpha, Beta = 4 paths)
    expect(updatedArcs.length).toBe(4);
    updatedArcs[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const endLabel2 = element.querySelector('#endlabel');
    expect(endLabel2?.querySelectorAll('img')).toHaveLength(0);
    expect(endLabel2?.textContent).toContain('<img src=x onerror=1>');
    // show_percent: false keeps center text blank
    const centerText2 = element.querySelector('svg:not(#trail) > g > text');
    expect(centerText2?.textContent).toBe('');

    // Clicking leaf arc with links invokes LookerCharts.Utils.openDrillMenu
    updatedArcs[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(drillMock).toHaveBeenCalledWith(expect.objectContaining({ links }));
  });
});
