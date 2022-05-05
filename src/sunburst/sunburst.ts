import * as d3 from 'd3'
import * as SSF from 'ssf'
import { handleErrors }  from '../utils'

import {
  Link,
  Looker,
  LookerChartUtils,
  Row,
  VisConfig,
  VisualizationDefinition
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

function burrow(table: Row[], config: VisConfig) {
  // create nested object
  const obj: any = {}

  table.forEach((row: Row) => {
    // start at root
    let layer = obj

    // create children as nested objects
    row.taxonomy.value.forEach((key: any) => {
      if (key === null && !config.show_null_points) {
        return
      }
      layer[key] = key in layer ? layer[key] : {}
      layer = layer[key]
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
    if (row[datum].links) {
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
    d3.select(element).append('div').attr('id','sunburst-breadcrumbs')
    this.svg = d3.select(element).append('svg').style('margin-top', "-25px")
  },
  // Render in response to the data or settings changing
  update(data, element, config, queryResponse) {
    if (!handleErrors(this, queryResponse, {
      min_pivots: 0, max_pivots: 0,
      min_dimensions: 1, max_dimensions: undefined,
      min_measures: 1, max_measures: 1
    })) return

    d3.select("#trail").remove()

    const width = element.clientWidth
    const height = element.clientHeight
    const radius = Math.min(width, height) / 2 - 8

    const dimensions = queryResponse.fields.dimension_like
    const measure = queryResponse.fields.measure_like[0]
    const default_value_format = measure.value_format || "#,##0"
    const format = ((s: any): string => SSF.format(config.value_format_override !== "" ? config.value_format_override : default_value_format, s))

    const colorScale: d3.ScaleOrdinal<string, null> = d3.scaleOrdinal()
    const color = colorScale.range(config.color_range || [])

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

    const partition = d3.partition().size([2 * Math.PI, radius * radius])
    const arc = (
      d3.arc()
      .startAngle((d: any) => d.x0)
      .endAngle((d: any) => d.x1)
      .innerRadius((d: any) => Math.sqrt(d.y0))
      .outerRadius((d: any) => Math.sqrt(d.y1))
    )

    const svg = (
      this.svg
      .html('')
      .attr('width', '100%')
      .attr('height', '100%')
      .append('g')
      .attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')')
    )

    const center = svg.append('text')
      .style("text-anchor", "middle")
      .style('dominant-baseline', 'middle')
      .attr("font-size", Math.min(parseInt(d3.select('svg').style("width")), parseInt(d3.select("svg").style("height")))/12);
    
    const getColorByNode = function(d: any){
      if (d.depth === 0) return 'none'
      if (config.color_by === colorBy.NODE) {
        return color(d.data.name)
      } else {
        return color(d.ancestors().map((p: any) => p.data.name).slice(-2, -1))
      }
    }

    const minLabelWidth = 750
    const trail = d3.select("#sunburst-breadcrumbs").append("svg:svg")
      .attr("width", minLabelWidth)
      .attr("height", 50)
      .attr("id", "trail")
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
		  var b = breadcrumbs;
      // Data join; key function combines name and depth (= position in sequence).
      var g = d3.select("#trail")
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
      d3.select("#trail").selectAll("g").attr("transform", (d: any, i: number) => {
        lastDim = d
        if(i >= dimensions.length) {return "translate(" + breadcrumbStart + ", 0)"}
        breadcrumbStart += (d.parent.data.name === "root"? 0 : (breadcrumbWidth(d.parent.data.name)) + b.s)
        return "translate(" + breadcrumbStart  + ", 0)"
      });

      // Now move and update the percentage at the end.
      d3.select("#sunburst-breadcrumbs").select("#trail").select("#endlabel")
        .attr("x", (breadcrumbStart + breadcrumbWidth(lastDim.data.name) + (b.s)) + 50  + "px")
        .attr("y", b.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .html(format(value))
        .style('font-weight', 'bold')

      updateLabelWidth((breadcrumbStart + breadcrumbWidth(lastDim.data.name) + (b.s)) + 50 + breadcrumbWidth(format(value)))

      // Make the breadcrumb trail visible, if it's hidden.
      d3.select("#sunburst-breadcrumbs").select("#trail")
        .style("visibility", "");
    }


    const root = d3.hierarchy(burrow(data, config)).sum((d: any) => {
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
    .on('click', function (this: any, d: any) {
      const event: object = { pageX: d3.event.pageX, pageY: d3.event.pageY }
      LookerCharts.Utils.openDrillMenu({
        links: d.data.links,
        event: event
      })
    })
    .on('mouseenter', (d: any) => {
      var sequence = getAncestors(d)
      updateBreadcrumbs(sequence, d.value)
      if(config.show_percent){ center.text(` ${((d.value/total) * 100).toFixed(2).toString() + "%"}`) }

      const ancestors = d.ancestors()
      svg
      .selectAll('path')
      .style('fill-opacity', (p: any) => {
        return ancestors.indexOf(p) > -1 ? 1 : 0.15
      })
    })
    .on('mouseleave', (d: any) => {
      d3.select("#sunburst-breadcrumbs").select("#trail")
			.style("visibility", "hidden")
      center.text('')
      //label.text('')
      svg
      .selectAll('path')
      .style('fill-opacity', (d: any) => 1 - d.depth * 0.15)
    })
  }
}

looker.plugins.visualizations.add(vis)
