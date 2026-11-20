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

    // Verify markup inside value_format_override is rendered as plain text, never parsed as HTML
    vis.updateAsync(
      data,
      element,
      { value_format_override: '"<b>tag</b>"#,##0', show_percent: false, show_null_points: false },
      queryResponse,
      undefined,
      doneCallback
    );
    const updatedArcs = Array.from(element.querySelectorAll('svg:not(#trail) path'));
    // With show_null_points: false, null dim2 is skipped (root, __proto__, Alpha, Beta = 4 paths)
    expect(updatedArcs.length).toBe(4);
    updatedArcs[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const endLabel2 = element.querySelector('#endlabel');
    expect(endLabel2?.querySelectorAll('b')).toHaveLength(0);
    expect(endLabel2?.textContent).toContain('<b>tag</b>');
    // show_percent: false keeps center text blank
    const centerText2 = element.querySelector('svg:not(#trail) > g > text');
    expect(centerText2?.textContent).toBe('');

    // Clicking leaf arc with links invokes LookerCharts.Utils.openDrillMenu
    updatedArcs[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(drillMock).toHaveBeenCalledWith(expect.objectContaining({ links }));
  });

  it('falls back to default format or String(s ?? "") when SSF.format throws', () => {
    vis.create(element, {});
    vis.addError = jest.fn();
    vis.clearErrors = jest.fn();

    const data = [
      { dim1: { value: 'A' }, meas1: { value: 42 } },
    ];
    const queryResponseWithInvalidDefault = {
      fields: {
        pivots: [],
        dimensions: [{ name: 'dim1' }],
        dimension_like: [{ name: 'dim1' }],
        measure_like: [{ name: 'meas1', value_format: '"unterminated' }],
      },
    };

    // Both override and default throw -> falls back cleanly to String(s ?? '')
    vis.updateAsync(
      data,
      element,
      { value_format_override: '"also_unterminated' },
      queryResponseWithInvalidDefault,
      undefined,
      doneCallback
    );

    const arcs = Array.from(element.querySelectorAll('svg:not(#trail) path'));
    expect(() => {
      arcs[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    }).not.toThrow();

    expect(element.querySelector('#endlabel')?.textContent).toBe('42');
    expect(vis.addError).not.toHaveBeenCalled();

    // Invalid override with valid default -> falls back to default_value_format
    const queryResponseWithValidDefault = {
      fields: {
        pivots: [],
        dimensions: [{ name: 'dim1' }],
        dimension_like: [{ name: 'dim1' }],
        measure_like: [{ name: 'meas1', value_format: '$#,##0.0' }],
      },
    };
    vis.updateAsync(
      data,
      element,
      { value_format_override: '"unterminated' },
      queryResponseWithValidDefault,
      undefined,
      doneCallback
    );
    const arcs2 = Array.from(element.querySelectorAll('svg:not(#trail) path'));
    arcs2[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(element.querySelector('#endlabel')?.textContent).toBe('$42.0');
  });

  it('handles missing, null, non-numeric, and numeric-string measure cells and derives total from root.value', () => {
    vis.create(element, {});
    vis.addError = jest.fn();
    vis.clearErrors = jest.fn();

    const data: any[] = [
      { dim1: { value: 'Valid' }, meas1: { value: 50 } },
      { dim1: { value: 'NumericString' }, meas1: { value: '50' } },
      { dim1: { value: 'MissingCell' } },
      { dim1: { value: 'NullCell' }, meas1: null },
      { dim1: { value: 'NullValue' }, meas1: { value: null } },
      { dim1: { value: 'BoolValue' }, meas1: { value: true } },
      { dim1: { value: 'StringValue' }, meas1: { value: 'not-a-number' } },
      { dim1: { value: 'NaNValue' }, meas1: { value: NaN } },
    ];
    const queryResponse = {
      fields: {
        pivots: [],
        dimensions: [{ name: 'dim1' }],
        dimension_like: [{ name: 'dim1' }],
        measure_like: [{ name: 'meas1', value_format: '#,##0' }],
      },
    };

    vis.updateAsync(data, element, {}, queryResponse, undefined, doneCallback);

    expect(doneCallback).toHaveBeenCalled();
    expect(vis.addError).not.toHaveBeenCalled();

    const arcs = Array.from(element.querySelectorAll('svg:not(#trail) path'));
    // Valid (50) and NumericString ('50' -> 50) each represent 50.00% of total = 100
    arcs[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(element.querySelector('svg:not(#trail) > g > text')?.textContent).toBe(' 50.00%');
    expect(element.querySelector('#endlabel')?.textContent).toBe('50');

    arcs[2].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(element.querySelector('svg:not(#trail) > g > text')?.textContent).toBe(' 50.00%');
    expect(element.querySelector('#endlabel')?.textContent).toBe('50');
  });
});
