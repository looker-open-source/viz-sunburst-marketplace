// © 2019 Google LLC.  All rights reserved.
//
// This software is subject to the Google Cloud Terms of Service, as
// modified by the "General Software Terms" of the Google Cloud Service Specific Terms, available at: https://cloud.google.com/terms/service-terms.

import * as d3 from 'd3'
import * as SSF from 'ssf'
import { handleErrors, parseColorRange } from '../utils'

import {
  Link,
  Looker,
  LookerChartUtils,
  Row,
  VisConfig,
  VisualizationDefinition,
  VisQueryResponse,
  VisUpdateDetails
} from '../types'

// Global values provided via the API
declare var looker: Looker
declare var LookerCharts: LookerChartUtils

const colorBy = {
  NODE: 'node',
  ROOT: 'root'
}

interface SunburstVisualization extends VisualizationDefinition {
  svg?: any,
}

// recursively create children array
function descend(obj: any, depth: number = 0) {
  const arr: any[] = []
  for (const k in obj) {
    if (k === '__data') {
      continue
    }
    const child: any = {
      name: k,
      depth,
      children: descend(obj[k], depth + 1)
    }
    if ('__data' in obj[k]) {
      child.data = obj[k].__data
      child.links = obj[k].__data.taxonomy.links
    }
    arr.push(child)
  }
  return arr
}

function burrow(table: Row[], showNullPoints: boolean) {
  // create nested null-prototype object to prevent Object.prototype key collisions
  const obj: any = Object.create(null)

  table.forEach((row: Row) => {
    // start at root
    let layer = obj

    // create children as nested objects
    row.taxonomy.value.forEach((key: any) => {
      if (key === null && !showNullPoints) {
        return
      }
      const propKey = String(key)
      layer[propKey] = Object.prototype.hasOwnProperty.call(layer, propKey)
        ? layer[propKey]
        : Object.create(null)
      layer = layer[propKey]
    })
    layer.__data = row
  })

  // use descend to create nested children arrays
  return {
    name: 'root',
    children: descend(obj, 1),
    depth: 0
  }
}

const getLinksFromRow = (row: Row): Link[] => {
  return Object.keys(row).reduce((links: Link[], datum) => {
    if (datum === 'taxonomy') {
      return links
    }
    if (row[datum]?.links) {
      const datumLinks = row[datum].links as Link[]
      return links.concat(datumLinks)
    } else {
      return links
    }
  }, [])
}



const vis: SunburstVisualization = {
  id: 'sunburst', // id/label not required, but nice for testing and keeping manifests in sync
  label: 'Sunburst',
  options: {
    color_range: {
      type: 'array',
      label: 'Color Range',
      display: 'colors',
      default: ['#4285F4', '#EA4335', '#FBBC04', '#34A852', '#5F6368']
    },
    color_by: {
      type: 'string',
      label: 'Color By',
      display: 'select',
      values: [
        { 'Color By Root': colorBy.ROOT },
        { 'Color By Node': colorBy.NODE }
      ],
      default: colorBy.ROOT
    },
    show_null_points: {
      type: 'boolean',
      label: 'Plot Null Values',
      default: true
    },
    value_format_override: {
      type: 'string',
      label: 'Value Format Override',
      default: ''
    },
    show_percent: {
      type: 'boolean',
      label: 'Percent on Hover',
      default: true
    },
  },
  // Set up the initial state of the visualization
  create(element, _config) {
    element.style.fontFamily = `"Open Sans","Noto Sans JP","Noto Sans","Noto Sans CJK KR", "Helvetica" , "Arial" , "sans-serif"`
    element.style.overflow = 'hidden'
    d3.select(element)
      .append('div')
      .attr('id', 'sunburst-breadcrumbs')
      .style('height', '36px')
      .style('overflow-x', 'auto')
      .style('overflow-y', 'hidden')
    this.svg = d3.select(element).append('svg').style('display', 'block')
  },
  // Render in response to the data or settings changing
  updateAsync(
    data: Row[],
    element: HTMLElement,
    config: VisConfig,
    queryResponse: VisQueryResponse,
    details: VisUpdateDetails | undefined,
    done?: () => void
  ) {
    try {
      if (!handleErrors(this, queryResponse, {
        min_pivots: 0, max_pivots: 0,
        min_dimensions: 1, max_dimensions: undefined,
        min_measures: 1, max_measures: 1
      })) {
        done?.()
        return
      }

    const rootContainer = d3.select(element)
    const breadcrumbsContainer = rootContainer.select('#sunburst-breadcrumbs')
    breadcrumbsContainer.selectAll('#trail').remove()

    const trailHeight = 36
    const width = Math.max(0, element.clientWidth)
    const height = Math.max(0, element.clientHeight)
    const svgHeight = Math.max(0, height - trailHeight)
    const radius = Math.max(0, Math.min(width, svgHeight) / 2 - 8)

    const dimensions = queryResponse.fields.dimension_like
    const measure = queryResponse.fields.measure_like[0]
    const default_value_format = measure.value_format || "#,##0"
    const overrideFormat = typeof config?.value_format_override === 'string'
      ? config.value_format_override.trim()
      : ''
    const format = (s: any): string => {
      const pattern = overrideFormat !== '' ? overrideFormat : default_value_format
      try {
        return SSF.format(pattern, s)
      } catch {
        return SSF.format(default_value_format, s)
      }
    }

    const defaultColors: string[] = this.options.color_range.default
    const parsedColors = parseColorRange(config?.color_range)
    const effectiveColors = parsedColors.length > 0 ? parsedColors : defaultColors
    const effectiveColorBy = config?.color_by ?? this.options.color_by.default
    const showNullPoints = config?.show_null_points ?? this.options.show_null_points.default
    const showPercent = config?.show_percent ?? this.options.show_percent.default

    const colorScale = d3.scaleOrdinal<string, string>()
    const color = colorScale.range(effectiveColors)

    const breadcrumbs = {
      w: 75,
      h: 30,
      s: 4,
      t: 10
    }
    const breadcrumbWidth = (name: string) => Math.max(name.length * 10, breadcrumbs.w)
    const getAncestors = function(node: any) {
      var path = [];
      var current = node;
      while (current.parent) {
        path.unshift(current);
        current = current.parent;
      }
      return path;
    }

    var total = 0
    data.forEach(row => {
      row.taxonomy = {
        links: getLinksFromRow(row),
        value: dimensions.map((dimension) => row[dimension.name].value)
      }
      total += row[measure.name].value
    })

    const partition = d3.partition<any>().size([2 * Math.PI, radius * radius])
    const arc = (
      d3.arc()
      .startAngle((d: any) => d.x0)
      .endAngle((d: any) => d.x1)
      .innerRadius((d: any) => Math.sqrt(d.y0))
      .outerRadius((d: any) => Math.sqrt(d.y1))
    )

    this.svg.selectAll('*').remove()
    const svg = (
      this.svg
      .attr('width', width)
      .attr('height', svgHeight)
      .append('g')
      .attr('transform', 'translate(' + width / 2 + ',' + svgHeight / 2 + ')')
    )

    const center = svg.append('text')
      .style("text-anchor", "middle")
      .style('dominant-baseline', 'middle')
      .attr("font-size", Math.max(12, Math.min(width, svgHeight) / 12));
    
    const getColorByNode = function(d: any){
      if (d.depth === 0) return 'none'
      if (effectiveColorBy === colorBy.NODE) {
        return color(String(d.data.name))
      } else {
        const rootAncestor = d.ancestors().map((p: any) => p.data.name).slice(-2, -1)[0]
        return color(String(rootAncestor ?? d.data.name))
      }
    }

    const minLabelWidth = width
    const trail = breadcrumbsContainer.append("svg:svg")
      .attr("width", minLabelWidth)
      .attr("height", trailHeight)
      .attr("id", "trail")
      .style("display", "block")
    trail.append("svg:text")
    .attr("id", "endlabel")
    .style("fill", "#000");

    const updateLabelWidth = function(w: number = 0) {
      trail.attr("width", Math.max(minLabelWidth, w))
    }
  
    const breadcrumbPoints = function(d: any, i: any) {
        var points = [];
        var b = breadcrumbs;
        var width = breadcrumbWidth(d.data.name)

        //Base point
        points.push("0,0");
        //Top margin length
        points.push(width + ",0");
        //Base to tip length
        points.push(width + b.t  + "," + (b.h / 2));
        //Bottom margin length
        points.push(width + "," + b.h);
        //Defines height
        points.push("0," + b.h);
        if (i > 0) { // Leftmost breadcrumb; don't include 6th vertex.
          points.push(b.t + "," + (b.h / 2));
        }
        return points.join(" ");
    }

    const updateBreadcrumbs = (sequence: any[], value: any) =>{
      if (!sequence || sequence.length === 0) {
        return
      }
		  var b = breadcrumbs;
      // Data join; key function combines name and depth (= position in sequence).
      var g = trail
        .selectAll("g")
        .data(sequence, function(d: any) { return d.data.name + d.data.depth; })

      // Add breadcrumb and label for entering nodes.
      var entering = g.enter().append("svg:g");

      entering.append("svg:polygon")
        .attr("points", breadcrumbPoints)
        .style("fill", getColorByNode);
      
      entering.append("svg:text")
        .attr("x", (d: any) => { return (breadcrumbWidth(d.data.name) + b.t) / 2 })
        .attr("y", b.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(function(d) { return d.data.name; });

      // Remove exiting nodes.
      g.exit().remove();


      // Set position for entering and updating nodes.
      var breadcrumbStart = 0;
      var lastDim: any;
      trail.selectAll("g").attr("transform", (d: any, i: number) => {
        lastDim = d
        if(i >= dimensions.length) {return "translate(" + breadcrumbStart + ", 0)"}
        breadcrumbStart += (d.parent.data.name === "root"? 0 : (breadcrumbWidth(d.parent.data.name)) + b.s)
        return "translate(" + breadcrumbStart  + ", 0)"
      });

      if (!lastDim) {
        return
      }

      // Now move and update the formatted measure value at the end.
      const formattedValue = format(value)
      trail.select("#endlabel")
        .attr("x", (breadcrumbStart + breadcrumbWidth(lastDim.data.name) + (b.s)) + 50  + "px")
        .attr("y", b.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(formattedValue)
        .style('font-weight', 'bold')

      updateLabelWidth((breadcrumbStart + breadcrumbWidth(lastDim.data.name) + (b.s)) + 50 + breadcrumbWidth(formattedValue))

      // Make the breadcrumb trail visible, if it's hidden.
      trail.style("visibility", "");
    }


    const root = d3.hierarchy(burrow(data, showNullPoints)).sum((d: any) => {
      return 'data' in d ? d.data[measure.name].value : 0
    })
    partition(root)

    svg
    .selectAll('path')
    .data(root.descendants())
    .enter()
    .append('path')
    .attr('d', arc)
    .style('fill', getColorByNode)
    .style('fill-opacity', (d: any) => 1 - d.depth * 0.15)
    .style('transition', (d: any) => 'fill-opacity 0.2s')
    .style('stroke', (d: any) => '#fff')
    .style('stroke-width', (d: any) => '0.5px')
    .on('click', function (this: any, event: any, d: any) {
      if (d.depth === 0) return
      const clickEvent: object = { pageX: event.pageX, pageY: event.pageY }
      LookerCharts.Utils.openDrillMenu({
        links: d.data.links || [],
        event: clickEvent
      })
    })
    .on('mouseenter', (event: any, d: any) => {
      if (d.depth === 0) return
      var sequence = getAncestors(d)
      updateBreadcrumbs(sequence, d.value)
      if (showPercent) {
        const percent = total > 0 ? ((d.value / total) * 100).toFixed(2) : "0.00"
        center.text(` ${percent}%`)
      }

      const ancestors = d.ancestors()
      svg
      .selectAll('path')
      .style('fill-opacity', (p: any) => {
        return ancestors.indexOf(p) > -1 ? 1 : 0.15
      })
    })
    .on('mouseleave', () => {
      trail.style("visibility", "hidden")
      center.text('')
      svg
      .selectAll('path')
      .style('fill-opacity', (p: any) => 1 - p.depth * 0.15)
    })
    done?.()
    } catch (error) {
      console.error(error)
      if (this.addError) {
        this.addError({
          title: "Rendering Error",
          message: (error as any).message,
          group: "render"
        })
      }
      done?.()
    }
  }
}

looker.plugins.visualizations.add(vis)
